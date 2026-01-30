
// CallInterface.tsx: Maya AI - Ultra-Fast Mentor with Level-Based Teaching & Premium Reports
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
  mentorTip: string;
  category: 'Grammar' | 'Vocabulary' | 'Pronunciation' | 'Example';
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
    return (window as any).GEMINI_API_KEY || (window as any).NEXT_PUBLIC_MAYA_ACCESS || (window as any).NEXT_PUBLIC_API_KEY || env.API_KEY;
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
        try { await updateDoc(doc(db, 'users', currentUser.uid), { credits: increment(-creditsToDeduct) }); } catch (e) {}
      }
      generateCorrectionReport(transcriptsRef.current);
    };
    performCleanup();
  }, [language]);

  const generateCorrectionReport = useCallback(async (finalTranscripts: ChatMessage[]) => {
    if (finalTranscripts.length === 0) return;
    const apiKey = getActiveApiKey();
    if (!apiKey) return;
    
    setIsGeneratingReport(true);
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Premium Session Analysis for Bengali Learner:
      Language: ${language}.
      Instruction: 
      1. Analyze linguistic growth and provide 6-8 key corrections/vocabulary tips.
      2. For each item:
         - original: user's phrase or a common mistake.
         - corrected: the professional target version.
         - explanation: English professional breakdown.
         - mentorTip: Crucial Bengali explanation (Romanized) to help with native logic.
         - category: Grammar/Vocabulary/Pronunciation.
      3. Format: JSON array only.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: prompt }, { text: JSON.stringify(finalTranscripts) }] }],
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
    setIsUnlocking(true);
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists() && (userSnap.data().credits >= 10)) {
        await updateDoc(userRef, { credits: increment(-10) });
        setIsReportUnlocked(true);
      } else {
        setUnlockError("আপনার পর্যাপ্ত ক্রেডিট নেই (১০ ক্রেডিট লাগবে)। 🌸");
      }
    } catch (err) {
      setUnlockError("আনলক ব্যর্থ হয়েছে।");
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (isPdfDownloading) return;
    setIsPdfDownloading(true);
    try {
      const { jsPDF } = await import('jspdf');
      const docPdf = new jsPDF();
      
      docPdf.setFillColor(15, 23, 42); 
      docPdf.rect(0, 0, 210, 297, 'F');
      docPdf.setFillColor(236, 72, 153); 
      docPdf.rect(0, 0, 10, 297, 'F');

      docPdf.setTextColor(255, 255, 255);
      docPdf.setFontSize(32);
      docPdf.setFont("helvetica", "bold");
      docPdf.text('MAYA AI MENTOR', 25, 30);
      docPdf.setTextColor(236, 72, 153);
      docPdf.setFontSize(14);
      docPdf.text('PREMIUM SMART SESSION REPORT', 25, 40);

      docPdf.setFillColor(30, 41, 59); 
      docPdf.roundedRect(25, 55, 160, 45, 5, 5, 'F');
      docPdf.setTextColor(148, 163, 184);
      docPdf.setFontSize(10);
      docPdf.text('LEARNER:', 35, 70);
      docPdf.text('PRACTICE:', 35, 80);
      docPdf.text('SESSION ID:', 110, 70);
      docPdf.text('DATE:', 110, 80);

      docPdf.setTextColor(255, 255, 255);
      docPdf.setFontSize(12);
      docPdf.text(auth.currentUser?.displayName || 'Friend', 65, 70);
      docPdf.text(language, 65, 80);
      docPdf.text(`#MAYA-${Math.random().toString(36).substr(2, 6).toUpperCase()}`, 135, 70);
      docPdf.text(new Date().toLocaleDateString(), 135, 80);

      const score = Math.max(70, 100 - (correctionReport.length * 4));
      docPdf.setFillColor(236, 72, 153);
      docPdf.roundedRect(25, 110, 160, 30, 4, 4, 'F');
      docPdf.setTextColor(255, 255, 255);
      docPdf.setFontSize(11);
      docPdf.text('YOUR PERFORMANCE SCORE', 80, 120);
      docPdf.setFontSize(22);
      docPdf.text(`${score}%`, 95, 132);

      let yPos = 165;
      correctionReport.forEach((c, i) => {
        if (yPos > 260) {
          docPdf.addPage();
          docPdf.setFillColor(15, 23, 42);
          docPdf.rect(0, 0, 210, 297, 'F');
          docPdf.setFillColor(236, 72, 153);
          docPdf.rect(0, 0, 10, 297, 'F');
          yPos = 30;
        }
        docPdf.setFillColor(51, 65, 85);
        docPdf.roundedRect(25, yPos, 35, 7, 2, 2, 'F');
        docPdf.setTextColor(236, 72, 153);
        docPdf.setFontSize(8);
        docPdf.text(c.category.toUpperCase(), 29, yPos + 5);
        yPos += 14;
        docPdf.setTextColor(252, 165, 165);
        docPdf.text(`X Error: "${c.original}"`, 25, yPos);
        yPos += 8;
        docPdf.setTextColor(110, 231, 183);
        docPdf.text(`V Corrected: "${c.corrected}"`, 25, yPos);
        yPos += 8;
        docPdf.setTextColor(255, 255, 255);
        const explText = docPdf.splitTextToSize(`Explanation: ${c.explanation}`, 160);
        docPdf.text(explText, 25, yPos);
        yPos += (explText.length * 5) + 4;
        docPdf.setTextColor(148, 163, 184);
        docPdf.text(`Mentor Advice: ${c.mentorTip}`, 25, yPos);
        yPos += 15;
      });

      docPdf.save(`Maya_Premium_Smart_Report_${new Date().getTime()}.pdf`);
    } catch (err) {
      console.error(err);
      alert("PDF ডাউনলোড ব্যর্থ হয়েছে।");
    } finally {
      setIsPdfDownloading(false);
    }
  };

  const handleStartCall = async () => {
    if (startedRef.current) return;
    setStatus('connecting');
    setLoadingStep('মায়া প্রস্তুত হচ্ছে...');

    try {
      const apiKey = getActiveApiKey();
      if (!apiKey) throw new Error("API Key missing");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
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
            timerRef.current = window.setInterval(() => setElapsed(e => e + 1), 1000);

            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              sessionPromise.then(s => s.sendRealtimeInput({ media: createBlob(inputData) }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (isEndingRef.current) return;
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              const { output: outCtx } = audioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), outCtx, 24000, 1);
              const source = outCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outCtx.destination);
              source.onended = () => {
                activeSources.current.delete(source);
                if (activeSources.current.size === 0) setIsSpeaking(false);
              };
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              activeSources.current.add(source);
              setIsSpeaking(true);
            }
            if (message.serverContent?.inputTranscription) currentInputTrans.current += message.serverContent.inputTranscription.text;
            if (message.serverContent?.outputTranscription) currentOutputTrans.current += message.serverContent.outputTranscription.text;
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
          onerror: () => setError("কানেকশন ইরর!"),
          onclose: () => { if (!isEndingRef.current) handleEndCall(); }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: `You are Maya, a sweet, young, misty-voiced AI Mentor for Bengali speakers. 
          Respond FAST and SNAPPY. As soon as user finishes, reply immediately.
          
          START OF CALL:
          - Say: "আসসালামু আলাইকুম বন্ধু! মায়া AI মেন্টর-এ আপনাকে স্বাগতম। আজ আমরা কোন লেভেলে প্র্যাকটিস করবো? আপনি কি Beginning, Medium নাকি Expert লেভেল বেছে নেবেন?"
          - English Levels: Beginning, Medium, Expert.
          - German Levels: A1, A2, B1, B2, Expert.
          
          MENTORING STYLE:
          - If user wants VOCABULARY: Say word in ${language} -> Bengali meaning -> Example in ${language} -> Example Bengali meaning.
          
          LEVEL RULES:
          - Beginning/A1/A2: Speak very slowly. Translate EVERY phrase/question to Bengali.
          - Medium/B1/B2: Moderate speed. Still translate phrases.
          - Expert: Fast, natural, high-level ${language}. No Bengali needed.
          
          MAYA'S TONE: Sweet, encouraging, acting as a personal guide. No delays. Be snappy!`,
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      setError("মাইক্রোফোন চালু করা যায়নি!");
      setStatus('idle');
    }
  };

  useEffect(() => { handleStartCall(); return () => { if (!isEndingRef.current) handleEndCall(); }; }, []);

  if (status === 'summary') {
    return (
      <div className="fixed inset-0 bg-white z-[70] flex flex-col items-center pt-10 px-6 overflow-y-auto pb-20 animate-in fade-in">
        <div className="w-24 h-24 bg-pink-100 rounded-[2.5rem] flex items-center justify-center text-5xl mb-6 shadow-2xl animate-float">📊</div>
        <h2 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">সেশন অ্যানালাইসিস</h2>
        <div className="mt-4 flex space-x-3">
           <span className="bg-slate-100 text-slate-500 px-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest">Time: {formatTime(elapsed)}</span>
           <span className="bg-pink-50 text-pink-500 px-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest">{language} Session</span>
        </div>
        
        <div className="w-full max-w-lg mt-12 space-y-10 pb-10">
           <div className="bg-slate-900 text-white p-10 rounded-[4rem] relative overflow-hidden shadow-[0_50px_100px_rgba(0,0,0,0.3)] border border-slate-800">
              <div className="absolute top-0 right-0 w-64 h-64 bg-pink-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
              <h4 className="text-2xl font-black text-pink-500 mb-8 relative z-10 flex items-center">
                <span className="mr-3 text-3xl">✨</span> স্মার্ট সেশন রিপোর্ট
              </h4>
              
              {isGeneratingReport ? (
                 <div className="flex flex-col items-center justify-center py-20 space-y-5">
                    <div className="w-14 h-14 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">অ্যানালাইসিস হচ্ছে...</p>
                 </div>
              ) : isReportUnlocked ? (
                 <div className="space-y-8 relative z-10 animate-in fade-in duration-500">
                    {correctionReport.length > 0 ? (
                      <div className="space-y-10">
                         {correctionReport.map((c, i) => (
                           <div key={i} className="space-y-4 border-b border-slate-800 pb-8 last:border-0 group">
                              <span className="text-[9px] font-black bg-pink-500/20 text-pink-400 px-3 py-1 rounded-md uppercase tracking-widest">{c.category}</span>
                              <p className="text-sm font-bold text-rose-300 opacity-60">" {c.original} "</p>
                              <p className="text-lg font-black text-emerald-400 leading-tight">Correct: " {c.corrected} "</p>
                              <p className="text-[11px] text-slate-400 italic leading-relaxed font-medium">Mentor: {c.mentorTip}</p>
                           </div>
                         ))}
                      </div>
                    ) : (
                      <p className="text-center text-slate-500 py-10 font-bold">দারুণ! আপনি নিখুঁতভাবে সেশন শেষ করেছেন। ✨</p>
                    )}
                    
                    <div className="pt-8 border-t border-slate-800">
                      <button 
                        onClick={handleDownloadPdf}
                        disabled={isPdfDownloading}
                        className="w-full bg-pink-500 hover:bg-pink-600 text-white py-6 rounded-[2.5rem] font-black text-sm uppercase tracking-widest shadow-[0_20px_40px_rgba(236,72,153,0.3)] active:scale-95 transition-all flex items-center justify-center space-x-3"
                      >
                        {isPdfDownloading ? <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin" /> : <span className="flex items-center gap-2"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> Download PDF (10 Credits)</span>}
                      </button>
                    </div>
                 </div>
              ) : (
                 <div className="py-20 flex flex-col items-center justify-center text-center space-y-8 relative z-10">
                    <div className="w-28 h-28 bg-slate-800 rounded-[3rem] flex items-center justify-center text-6xl animate-pulse shadow-inner border border-slate-700">🔒</div>
                    <div className="space-y-3">
                       <h5 className="text-2xl font-black text-white tracking-tight">রিপোর্টটি আনলক করুন</h5>
                       <p className="text-xs text-slate-400 font-bold leading-relaxed px-8">আপনার ভোকাবুলারি টিপস এবং প্রিমিয়াম PDF রিপোর্টটি ১০ ক্রেডিট দিয়ে আনলক করুন।</p>
                    </div>
                    <button onClick={handleUnlockReport} disabled={isUnlocking} className="bg-white text-slate-950 px-14 py-6 rounded-[2.5rem] font-black text-xs uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all hover:bg-pink-500 hover:text-white">
                      {isUnlocking ? 'Unlocking...' : 'Unlock Now (10 Credits)'}
                    </button>
                    {unlockError && <p className="text-[10px] text-rose-500 font-black uppercase tracking-widest mt-2">{unlockError}</p>}
                 </div>
              )}
           </div>
           <button onClick={onEnd} className="w-full bg-slate-100 text-slate-900 py-7 rounded-[3rem] font-black text-xl active:scale-95 transition-all uppercase tracking-widest">ফিরে যান</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-pink-50 z-[60] flex flex-col animate-in fade-in overflow-hidden">
      <div className="p-6 flex justify-between items-center bg-white/40 backdrop-blur-xl border-b border-white">
        <div className="flex items-center space-x-4">
           <div className="w-14 h-14 rounded-[1.5rem] overflow-hidden shadow-xl border-2 border-pink-500 aspect-square">
              <img src={MAYA_AVATAR} className="w-full h-full object-cover" alt="Maya" />
           </div>
           <div>
              <h2 className="text-xl font-black text-gray-900 leading-none">মায়া Mentor</h2>
              <span className="text-[9px] font-black text-pink-500 uppercase tracking-widest">{language} Session</span>
           </div>
        </div>
        <div className="bg-white px-6 py-3 rounded-[1.5rem] shadow-lg border border-pink-100">
           <p className="text-pink-600 font-black text-2xl tracking-widest">{formatTime(elapsed)}</p>
        </div>
      </div>

      <div className="flex-grow flex flex-col items-center justify-center p-6 relative">
        <div className="relative mb-14">
          <div className={`absolute -inset-14 rounded-full bg-pink-500/10 blur-[80px] transition-all duration-700 ${isSpeaking ? 'scale-150 opacity-100' : 'scale-100 opacity-20'}`} />
          <div className={`w-64 h-64 md:w-72 md:h-72 rounded-[4rem] border-8 border-white shadow-2xl transition-all duration-700 relative z-10 animate-float overflow-hidden ${isSpeaking ? 'scale-105 ring-4 ring-pink-400/20' : ''}`}>
             <img src={MAYA_AVATAR} className="w-full h-full object-cover" alt="Maya" />
             {status === 'connecting' && <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md flex flex-col items-center justify-center z-20"><div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mb-4" /><p className="text-[10px] font-black text-white uppercase tracking-widest">{loadingStep}</p></div>}
          </div>
          <div className="absolute -bottom-4 -right-4 bg-white w-16 h-16 rounded-[1.5rem] shadow-2xl flex items-center justify-center text-3xl border border-pink-50 animate-bounce">💖</div>
        </div>

        <div className="text-center mb-14 h-32 flex items-center justify-center w-full max-w-sm">
           {error ? <div className="bg-rose-50 border border-rose-100 p-8 rounded-[3rem] shadow-xl animate-in zoom-in"><p className="text-rose-600 font-black text-sm">{error}</p></div> : 
           <div ref={scrollRef} className="w-full space-y-6 px-6 h-full overflow-y-auto no-scrollbar flex flex-col items-center">
              {transcripts.slice(-1).map((t, i) => (
                <div key={i} className={`animate-in slide-in-from-bottom-4 px-10 py-6 rounded-[3rem] text-sm font-bold shadow-2xl ${t.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-800 border border-pink-50'}`}>
                  {t.text}
                </div>
              ))}
           </div>}
        </div>

        <button onClick={handleEndCall} className="bg-rose-600 hover:bg-rose-700 w-28 h-28 rounded-full flex items-center justify-center shadow-[0_25px_60px_rgba(225,29,72,0.4)] active:scale-90 transition-all border-4 border-white group relative">
          <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
        </button>
      </div>

      <div className="p-10 pb-14 flex justify-center items-center">
        <div className="flex items-center space-x-4 h-16">
          {[...Array(9)].map((_, i) => (
            <div 
              key={i} 
              className={`w-2 rounded-full transition-all duration-300 ${isSpeaking ? 'bg-pink-500 shadow-[0_0_15px_#ec4899]' : 'bg-gray-200 h-2'}`} 
              style={{ height: isSpeaking ? `${20 + Math.random() * 50}px` : '8px' }} 
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default CallInterface;
