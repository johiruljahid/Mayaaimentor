
// CallInterface.tsx: Professional Voice Interface with Smart & Premium PDF Report Generation
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { auth, db } from '../firebase';
import { Language, UserProfile } from '../types';
import { createBlob, decode, decodeAudioData } from '../utils/audio-helpers';
import { doc, increment, updateDoc, getDoc } from 'firebase/firestore';

interface CallInterfaceProps {
  language: Language;
  onEnd: () => void;
}

interface ChatMessage {
  role: 'user' | 'maya';
  text: string;
}

interface Correction {
  original: string;
  corrected: string;
  explanation: string;
  mentorTip: string; // New: Explaining in simple terms for Bengali speakers
  category: 'Grammar' | 'Vocabulary' | 'Pronunciation';
}

const MAYA_AVATAR = "https://images.unsplash.com/photo-1594744803329-e58b31de8bf5?auto=format&fit=crop&q=80&w=400&h=400";

const CallInterface: React.FC<CallInterfaceProps> = ({ language, onEnd }) => {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'summary' | 'permission_denied'>('idle');
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [elapsed, setElapsed] = useState(0); 
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<ChatMessage[]>([]);
  const [correctionReport, setCorrectionReport] = useState<Correction[]>([]);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isReportUnlocked, setIsReportUnlocked] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isPdfDownloading, setIsPdfDownloading] = useState(false);
  
  const isEndingRef = useRef(false);
  const startedRef = useRef(false);
  const elapsedRef = useRef(0);
  const nextStartTimeRef = useRef(0);
  const currentInputTrans = useRef('');
  const currentOutputTrans = useRef('');
  
  const audioContextRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeSources = useRef<Set<AudioBufferSourceNode>>(new Set());
  const timerRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const transcriptsRef = useRef<ChatMessage[]>([]);

  useEffect(() => { transcriptsRef.current = transcripts; }, [transcripts]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [transcripts]);

  const getActiveApiKey = () => {
    const env = (window as any).process?.env || {};
    return (
      (window as any).GEMINI_API_KEY || 
      (window as any).NEXT_PUBLIC_MAYA_ACCESS ||
      (window as any).NEXT_PUBLIC_API_KEY || 
      env.API_KEY || 
      env.NEXT_PUBLIC_MAYA_ACCESS ||
      env.NEXT_PUBLIC_API_KEY
    );
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleEndCall = useCallback(() => {
    if (isEndingRef.current) return;
    isEndingRef.current = true;
    
    setStatus('summary');

    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    activeSources.current.forEach(s => { try { s.stop(); } catch(e) {} });
    activeSources.current.clear();

    if (audioContextRef.current) {
      audioContextRef.current.input.close();
      audioContextRef.current.output.close();
      audioContextRef.current = null;
    }

    const performCleanup = async () => {
      if (sessionRef.current) {
        try { await sessionRef.current.close(); } catch (e) {}
        sessionRef.current = null;
      }
      const currentUser = auth.currentUser;
      if (currentUser && !currentUser.isAnonymous && elapsedRef.current > 0) {
        const creditsToDeduct = elapsedRef.current / 60;
        try {
          await updateDoc(doc(db, 'users', currentUser.uid), { credits: increment(-creditsToDeduct) });
        } catch (e) {}
      }
      generateCorrectionReport(transcriptsRef.current);
    };
    performCleanup();
  }, [transcriptsRef, language]);

  const generateCorrectionReport = useCallback(async (finalTranscripts: ChatMessage[]) => {
    if (finalTranscripts.length === 0) return;
    const apiKey = getActiveApiKey();
    if (!apiKey) return;
    
    setIsGeneratingReport(true);
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Advanced Language Analysis for Bengali Native Speaker:
      Context: This is a ${language} practice session.
      Task: Provide a high-end linguistic critique.
      Requirements:
      1. Identify 6 core mistakes.
      2. For each mistake:
         - original: What user said.
         - corrected: Native level correction.
         - explanation: Professional English explanation.
         - mentorTip: A helpful tip in Romanized Bengali (e.g. "Ekhane subject-er por verb thik koro") for deeper understanding.
         - category: Grammar/Vocabulary/Pronunciation.
      3. Return ONLY a JSON array of objects.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          { parts: [{ text: prompt }, { text: JSON.stringify(finalTranscripts) }] }
        ],
        config: { responseMimeType: 'application/json' }
      });
      setCorrectionReport(JSON.parse(response.text || '[]'));
    } catch (err) {
      console.error("Report generation failed:", err);
    } finally {
      setIsGeneratingReport(false);
    }
  }, [language]);

  const handleUnlockReport = async () => {
    if (isReportUnlocked || isUnlocking) return;
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    setUnlockError(null);
    setIsUnlocking(true);
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) throw new Error("User missing");
      
      const userData = userSnap.data() as UserProfile;
      if (userData.credits < 10) {
        setUnlockError("Insufficient credits! You need 10 credits.");
        setIsUnlocking(false);
        return;
      }

      await updateDoc(userRef, { credits: increment(-10) });
      setIsReportUnlocked(true);
    } catch (err) {
      setUnlockError("Unlock failed. Try again.");
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (isPdfDownloading) return;
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    setIsPdfDownloading(true);
    try {
      const { jsPDF } = await import('jspdf');
      const docPdf = new jsPDF();
      
      // -- Premium Dark Background --
      docPdf.setFillColor(15, 23, 42); // slate-900
      docPdf.rect(0, 0, 210, 297, 'F');
      
      // -- Side Accent Stripe --
      docPdf.setFillColor(236, 72, 153); // pink-500
      docPdf.rect(0, 0, 8, 297, 'F');

      // -- Header --
      docPdf.setTextColor(255, 255, 255);
      docPdf.setFontSize(28);
      docPdf.setFont("helvetica", "bold");
      docPdf.text('MAYA AI MENTOR', 25, 30);
      
      docPdf.setTextColor(236, 72, 153);
      docPdf.setFontSize(12);
      docPdf.text('PREMIUM SMART PERFORMANCE REPORT', 25, 38);

      // -- User Info Card --
      docPdf.setFillColor(30, 41, 59); // slate-800
      docPdf.roundedRect(25, 50, 160, 45, 4, 4, 'F');
      
      docPdf.setTextColor(148, 163, 184); // slate-400
      docPdf.setFontSize(9);
      docPdf.text('LEARNER:', 35, 65);
      docPdf.text('PRACTICE:', 35, 75);
      docPdf.text('DATE:', 120, 65);
      docPdf.text('LEVEL:', 120, 75);

      docPdf.setTextColor(255, 255, 255);
      docPdf.setFontSize(12);
      docPdf.text(currentUser.displayName || 'Learner', 60, 65);
      docPdf.text(language, 60, 75);
      docPdf.text(new Date().toLocaleDateString(), 135, 65);
      docPdf.text('Active Scholar', 135, 75);

      // -- Stats Row --
      const score = Math.max(70, 100 - (correctionReport.length * 4));
      
      // Score Box
      docPdf.setFillColor(236, 72, 153);
      docPdf.roundedRect(25, 105, 50, 25, 3, 3, 'F');
      docPdf.setTextColor(255, 255, 255);
      docPdf.setFontSize(8);
      docPdf.text('FLUENCY SCORE', 35, 114);
      docPdf.setFontSize(16);
      docPdf.text(`${score}%`, 40, 124);

      // Duration Box
      docPdf.setFillColor(30, 41, 59);
      docPdf.roundedRect(80, 105, 50, 25, 3, 3, 'F');
      docPdf.setFontSize(8);
      docPdf.text('SESSION TIME', 90, 114);
      docPdf.setFontSize(16);
      docPdf.text(formatTime(elapsed), 92, 124);

      // Mistake Count
      docPdf.setFillColor(30, 41, 59);
      docPdf.roundedRect(135, 105, 50, 25, 3, 3, 'F');
      docPdf.setFontSize(8);
      docPdf.text('TOTAL CORRECTIONS', 140, 114);
      docPdf.setFontSize(16);
      docPdf.text(`${correctionReport.length}`, 155, 124);

      // -- Mentorship Section --
      docPdf.setFontSize(14);
      docPdf.setTextColor(236, 72, 153);
      docPdf.text('SMART LINGUISTIC ANALYSIS', 25, 150);
      docPdf.setDrawColor(236, 72, 153);
      docPdf.line(25, 153, 100, 153);

      let yPos = 165;
      correctionReport.forEach((c, i) => {
        if (yPos > 260) {
          docPdf.addPage();
          docPdf.setFillColor(15, 23, 42);
          docPdf.rect(0, 0, 210, 297, 'F');
          docPdf.setFillColor(236, 72, 153);
          docPdf.rect(0, 0, 8, 297, 'F');
          yPos = 30;
        }

        // Category Badge
        docPdf.setFillColor(236, 72, 153, 0.2);
        docPdf.roundedRect(25, yPos, 25, 5, 1, 1, 'F');
        docPdf.setTextColor(236, 72, 153);
        docPdf.setFontSize(6);
        docPdf.text(c.category.toUpperCase(), 27, yPos + 3.5);

        yPos += 12;
        docPdf.setFontSize(10);
        docPdf.setTextColor(252, 165, 165); // rose-300
        docPdf.text(`X Detected: "${c.original}"`, 25, yPos);
        
        yPos += 7;
        docPdf.setTextColor(110, 231, 183); // emerald-300
        docPdf.text(`V Correct:  "${c.corrected}"`, 25, yPos);

        yPos += 8;
        docPdf.setTextColor(255, 255, 255);
        docPdf.setFontSize(9);
        const explText = docPdf.splitTextToSize(`Info: ${c.explanation}`, 160);
        docPdf.text(explText, 25, yPos);
        
        yPos += (explText.length * 5) + 3;
        docPdf.setTextColor(148, 163, 184); // slate-400
        docPdf.setFontSize(8);
        docPdf.text(`Maya's Tip (For Bengali logic): ${c.mentorTip}`, 25, yPos);

        yPos += 15;
      });

      // -- Roadmap Box --
      if (yPos > 240) {
        docPdf.addPage();
        docPdf.setFillColor(15, 23, 42);
        docPdf.rect(0, 0, 210, 297, 'F');
        docPdf.setFillColor(236, 72, 153);
        docPdf.rect(0, 0, 8, 297, 'F');
        yPos = 30;
      }
      
      docPdf.setFillColor(30, 41, 59);
      docPdf.roundedRect(25, yPos, 160, 30, 4, 4, 'F');
      docPdf.setTextColor(236, 72, 153);
      docPdf.setFontSize(11);
      docPdf.text('NEXT STEPS & ROADMAP', 35, yPos + 10);
      docPdf.setTextColor(255, 255, 255);
      docPdf.setFontSize(9);
      docPdf.text('1. Practice vocabulary related to daily tasks.', 35, yPos + 18);
      docPdf.text('2. Focus on sentence structure observed in today\'s corrections.', 35, yPos + 24);

      docPdf.save(`Maya_Smart_Report_${new Date().getTime()}.pdf`);
      alert("Premium Smart Report downloaded! 🌸");
    } catch (err) {
      console.error("PDF Download failed", err);
      alert("PDF download issue. Check connection.");
    } finally {
      setIsPdfDownloading(false);
    }
  };

  const handleStartCall = async () => {
    if (startedRef.current) return;
    setError(null);
    setStatus('connecting');
    setLoadingStep('Maya is preparing...');

    try {
      const apiKey = getActiveApiKey();
      if (!apiKey) throw new Error("No API Key");

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true } 
      });
      streamRef.current = stream;

      const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
      const inputCtx = new AudioCtx({ sampleRate: 16000 });
      const outputCtx = new AudioCtx({ sampleRate: 24000 });
      audioContextRef.current = { input: inputCtx, output: outputCtx };

      const ai = new GoogleGenAI({ apiKey });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            if (isEndingRef.current) return;
            setStatus('active');
            startedRef.current = true;
            timerRef.current = window.setInterval(() => {
              setElapsed(e => {
                elapsedRef.current = e + 1;
                return e + 1;
              });
            }, 1000);

            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              if (isEndingRef.current) return;
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (isEndingRef.current) return;
            const audioBase64 = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioBase64) {
              const { output: outputCtx } = audioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              const audioBuffer = await decodeAudioData(decode(audioBase64), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputCtx.destination);
              source.onended = () => {
                activeSources.current.delete(source);
                if (activeSources.current.size === 0) setIsSpeaking(false);
              };
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              activeSources.current.add(source);
              setIsSpeaking(true);
            }
            
            // Transcription Handling Fix: Accurately capturing user and model turns
            if (message.serverContent?.inputTranscription) {
              currentInputTrans.current += message.serverContent.inputTranscription.text;
            }
            if (message.serverContent?.outputTranscription) {
              currentOutputTrans.current += message.serverContent.outputTranscription.text;
            }
            if (message.serverContent?.turnComplete) {
              const uText = currentInputTrans.current.trim();
              const mText = currentOutputTrans.current.trim();
              if (uText || mText) {
                setTranscripts(prev => [...prev, 
                  ...(uText ? [{ role: 'user', text: uText } as ChatMessage] : []),
                  ...(mText ? [{ role: 'maya', text: mText } as ChatMessage] : [])
                ]);
              }
              currentInputTrans.current = '';
              currentOutputTrans.current = '';
            }
            if (message.serverContent?.interrupted) {
              activeSources.current.forEach(s => { try { s.stop(); } catch(e) {} });
              activeSources.current.clear();
              nextStartTimeRef.current = 0;
              setIsSpeaking(false);
            }
          },
          onerror: () => setError("Connection Error. Check internet."),
          onclose: () => { if (!isEndingRef.current) handleEndCall(); }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: `You are Maya, a high-end AI Language Mentor. 
          User is learning ${language}. 
          IMPORTANT: Your responses must be supportive and clear. 
          Keep your audio misty and sweet.
          Transcribe everything clearly. If user speaks Bengali, guide them to English/German gently.`,
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      setError(err.message || "Mic Error!");
      setStatus('idle');
    }
  };

  useEffect(() => {
    handleStartCall();
    return () => { if (!isEndingRef.current) handleEndCall(); };
  }, []);

  if (status === 'summary') {
    return (
      <div className="fixed inset-0 bg-white z-[70] flex flex-col items-center pt-10 px-6 overflow-y-auto pb-20 animate-in fade-in">
        <div className="w-20 h-20 bg-pink-100 rounded-3xl flex items-center justify-center text-4xl mb-6 shadow-2xl animate-float">📊</div>
        <h2 className="text-3xl font-black text-gray-900 tracking-tighter">সেশন পারফরম্যান্স</h2>
        
        <div className="mt-4 flex space-x-3">
           <span className="bg-slate-100 text-slate-600 px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest">সময়: {formatTime(elapsed)}</span>
           <span className="bg-pink-50 text-pink-500 px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest">{language} Practice</span>
        </div>
        
        <div className="w-full max-w-lg mt-12 space-y-8 pb-10">
          <div className="bg-slate-900 text-white p-10 rounded-[4rem] border border-slate-800 relative overflow-hidden shadow-[0_40px_80px_rgba(0,0,0,0.3)]">
             <div className="absolute top-0 right-0 w-64 h-64 bg-pink-500/10 rounded-full blur-[100px]" />
             
             <div className="flex justify-between items-center mb-10 relative z-10">
                <h4 className="text-xl font-black text-pink-500 flex items-center">
                  <span className="mr-3">⭐</span> স্মার্ট সেশন রিপোর্ট
                </h4>
                {isReportUnlocked && (
                  <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">Unlocked</span>
                )}
             </div>
             
             {isGeneratingReport ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-5">
                  <div className="w-12 h-12 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">অ্যানালাইসিস হচ্ছে...</p>
                </div>
             ) : isReportUnlocked ? (
                <div className="space-y-8 animate-in fade-in duration-500 relative z-10">
                   {correctionReport.length > 0 ? (
                      <div className="space-y-8">
                         {correctionReport.slice(0, 5).map((c, i) => (
                           <div key={i} className="space-y-3 group border-b border-slate-800 pb-6 last:border-0">
                              <div className="flex items-center space-x-3">
                                 <span className="text-[8px] font-black bg-pink-500/20 text-pink-400 px-2 py-0.5 rounded uppercase">{c.category}</span>
                              </div>
                              <p className="text-sm font-bold text-rose-300 opacity-60">" {c.original} "</p>
                              <p className="text-md font-black text-emerald-400">Correct: " {c.corrected} "</p>
                              <p className="text-[10px] text-slate-400 leading-relaxed font-medium italic">Hint: {c.mentorTip}</p>
                           </div>
                         ))}
                      </div>
                   ) : (
                      <p className="text-center text-slate-500 py-10 font-bold">দারুণ! আপনি কোনো ভুল করেননি। ✨</p>
                   )}
                   
                   <div className="pt-10 border-t border-slate-800">
                      <button 
                        onClick={handleDownloadPdf}
                        disabled={isPdfDownloading}
                        className="w-full bg-pink-500 hover:bg-pink-600 text-white py-6 rounded-[2.5rem] font-black text-sm uppercase tracking-widest shadow-[0_20px_40px_rgba(236,72,153,0.3)] active:scale-95 transition-all flex items-center justify-center space-x-3 disabled:opacity-50"
                      >
                        {isPdfDownloading ? (
                           <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        )}
                        <span>Download Smart Report (10 Credits)</span>
                      </button>
                   </div>
                </div>
             ) : (
                <div className="py-20 flex flex-col items-center justify-center text-center space-y-8 relative z-10">
                   <div className="w-24 h-24 bg-slate-800 rounded-[2.5rem] shadow-inner flex items-center justify-center text-5xl animate-pulse">🔒</div>
                   <div className="space-y-2 px-6">
                      <h5 className="text-xl font-black text-white">রিপোর্ট আনলক করুন</h5>
                      <p className="text-xs text-slate-400 font-bold leading-relaxed">আপনার মিস্টেক অ্যানালাইসিস এবং প্রিমিয়াম PDF ডাউনলোড অপশনটি ১০ ক্রেডিট দিয়ে আনলক করুন।</p>
                   </div>
                   <button 
                    onClick={handleUnlockReport}
                    disabled={isUnlocking}
                    className="bg-white text-slate-900 px-12 py-5 rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all hover:bg-pink-500 hover:text-white disabled:opacity-50"
                   >
                     {isUnlocking ? 'Unlocking...' : 'Unlock Now (10 Credits)'}
                   </button>
                   {unlockError && <p className="text-[10px] text-rose-500 font-black uppercase tracking-widest">{unlockError}</p>}
                </div>
             )}
          </div>
          
          <button onClick={onEnd} className="w-full bg-slate-100 text-slate-900 py-6 rounded-[2.5rem] font-black text-lg active:scale-95 transition-all uppercase tracking-widest">ফিরে যান</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-pink-50 z-[60] flex flex-col animate-in fade-in">
      <div className="p-6 flex justify-between items-center bg-white/40 backdrop-blur-xl border-b border-white">
        <div className="flex items-center space-x-3">
           <div className="w-12 h-12 rounded-full overflow-hidden shadow-lg border-2 border-pink-500">
              <img src={MAYA_AVATAR} className="w-full h-full object-cover" alt="Maya" />
           </div>
           <div>
              <h2 className="text-lg font-black text-gray-900 leading-none">মায়া AI Mentor</h2>
              <span className="text-[9px] font-black text-pink-500 uppercase tracking-widest">{language} Practice Session</span>
           </div>
        </div>
        <div className="bg-white px-5 py-2 rounded-full shadow-md border border-pink-50">
           <p className="text-pink-600 font-black text-xl tracking-widest">{formatTime(elapsed)}</p>
        </div>
      </div>

      <div className="flex-grow flex flex-col items-center justify-center p-6 relative">
        <div className="relative mb-10">
          <div className={`absolute -inset-10 rounded-full bg-pink-500/10 blur-3xl transition-all duration-700 ${isSpeaking ? 'scale-150 opacity-100' : 'scale-100 opacity-20'}`} />
          
          <div className={`w-64 h-64 rounded-full border-8 border-white shadow-2xl transition-all duration-700 relative z-10 animate-float overflow-hidden ${isSpeaking ? 'scale-105 ring-4 ring-pink-400/20' : ''}`}>
             <img src={MAYA_AVATAR} className="w-full h-full object-cover" alt="Maya" />
             {status === 'connecting' && (
               <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                  <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-[10px] font-black text-white uppercase tracking-widest">{loadingStep}</p>
               </div>
             )}
          </div>
        </div>

        <div className="text-center mb-10 h-24 flex items-center justify-center w-full max-w-sm">
           {error ? (
              <div className="bg-rose-50 border border-rose-100 p-6 rounded-[2rem] shadow-xl animate-in zoom-in">
                 <p className="text-rose-600 font-black text-sm">{error}</p>
              </div>
           ) : (
              <div ref={scrollRef} className="w-full space-y-4 px-4 h-full overflow-y-auto no-scrollbar flex flex-col items-center">
                {transcripts.slice(-1).map((t, i) => (
                  <div key={i} className={`animate-in slide-in-from-bottom-2 px-8 py-5 rounded-[2.5rem] text-sm font-bold shadow-xl ${t.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-800 border border-pink-50'}`}>
                    {t.text}
                  </div>
                ))}
              </div>
           )}
        </div>

        <button 
          onClick={handleEndCall} 
          className="bg-rose-600 hover:bg-rose-700 w-24 h-24 rounded-full flex items-center justify-center shadow-[0_20px_50px_rgba(225,29,72,0.4)] active:scale-90 transition-all border-4 border-white group"
        >
          <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
        </button>
      </div>

      <div className="p-8 pb-12 flex justify-center items-center">
        <div className="flex items-center space-x-3 h-12">
          {[...Array(9)].map((_, i) => (
            <div 
              key={i} 
              className={`w-1.5 rounded-full transition-all duration-300 ${isSpeaking ? 'bg-pink-500 shadow-[0_0_10px_#ec4899]' : 'bg-gray-200 h-2'}`} 
              style={{ height: isSpeaking ? `${20 + Math.random() * 40}px` : '8px' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default CallInterface;
