
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { doc, updateDoc, increment, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Language, UserProfile } from '../types';
import { decode, decodeAudioData, createBlob } from '../utils/audio-helpers';

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
}

const MAYA_AVATAR = "https://images.unsplash.com/photo-1594744803329-e58b31de8bf5?auto=format&fit=crop&q=80&w=400&h=400";
const COMPONENT_VERSION = "v1.8-ultra-fix";

const CallInterface: React.FC<CallInterfaceProps> = ({ language, onEnd }) => {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'summary' | 'permission_denied'>('idle');
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [mayaThinking, setMayaThinking] = useState(false);
  const [elapsed, setElapsed] = useState(0); 
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<ChatMessage[]>([]);
  const [correctionReport, setCorrectionReport] = useState<Correction[]>([]);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isNotesLocked, setIsNotesLocked] = useState(true);
  
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
  const wakeLockRef = useRef<any>(null);

  useEffect(() => { transcriptsRef.current = transcripts; }, [transcripts]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [transcripts]);

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator && (navigator as any).wakeLock) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch (err: any) {
        console.warn('Wake Lock error:', err.message);
      }
    }
  };

  const handleEndCall = useCallback(() => {
    if (isEndingRef.current) return;
    isEndingRef.current = true;
    
    if (wakeLockRef.current) wakeLockRef.current.release().then(() => wakeLockRef.current = null);
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
  }, [transcriptsRef]);

  const generateCorrectionReport = useCallback(async (finalTranscripts: ChatMessage[]) => {
    if (finalTranscripts.length === 0) return;
    setIsGeneratingReport(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Mentor Report: Analyze ${JSON.stringify(finalTranscripts)}. Identify grammar mistakes. Return JSON array: [{"original": "", "corrected": "", "explanation": ""}]`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      setCorrectionReport(JSON.parse(response.text || '[]'));
    } catch (err) {
      console.error("Report error:", err);
    } finally {
      setIsGeneratingReport(false);
    }
  }, []);

  const handleStartCall = async () => {
    if (startedRef.current) return;
    
    // UI RESET
    setError(null);
    setStatus('connecting');
    setLoadingStep('Initializing Audio...');

    try {
      // 1. STEP 1: CREATE CONTEXTS IMMEDIATELY (VITAL FOR MOBILE)
      const AudioCtxClass = (window.AudioContext || (window as any).webkitAudioContext);
      const inputCtx = new AudioCtxClass({ sampleRate: 16000 });
      const outputCtx = new AudioCtxClass({ sampleRate: 24000 });
      
      // Attempt immediate resume
      inputCtx.resume();
      outputCtx.resume();
      
      audioContextRef.current = { input: inputCtx, output: outputCtx };

      // 2. STEP 2: MIC ACCESS
      setLoadingStep('Accessing Microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
      });
      streamRef.current = stream;
      startedRef.current = true;

      // 3. STEP 3: AI HANDSHAKE
      setLoadingStep('Connecting to Maya AI...');
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            if (isEndingRef.current) return;
            setStatus('active');
            requestWakeLock();
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
              const pcmBlob = createBlob(e.inputBuffer.getChannelData(0));
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (isEndingRef.current) return;
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
               setIsSpeaking(true);
               setMayaThinking(false);
               try {
                 const buf = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
                 const src = outputCtx.createBufferSource();
                 src.buffer = buf;
                 src.connect(outputCtx.destination);
                 nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                 src.start(nextStartTimeRef.current);
                 nextStartTimeRef.current += buf.duration;
                 src.onended = () => {
                   activeSources.current.delete(src);
                   if (activeSources.current.size === 0) setIsSpeaking(false);
                 };
                 activeSources.current.add(src);
               } catch(e) { console.error("Audio Playback Error", e); }
            }
            if (message.serverContent?.interrupted) {
              activeSources.current.forEach(s => { try { s.stop(); } catch(e) {} });
              activeSources.current.clear();
              nextStartTimeRef.current = 0;
              setIsSpeaking(false);
            }
            if (message.serverContent?.inputAudioTranscription) {
              currentInputTrans.current += message.serverContent.inputAudioTranscription.text;
              setMayaThinking(true);
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
              setMayaThinking(false);
            }
          },
          onerror: (e) => {
            console.error("Gemini Socket Error:", e);
            if (!isEndingRef.current) setError("সার্ভারে সমস্যা হচ্ছে। আবার চেষ্টা করুন।");
          },
          onclose: (e) => {
            if (!isEndingRef.current && status !== 'summary') {
               startedRef.current = false;
               setStatus('permission_denied');
               setError("সংযোগ বিচ্ছিন্ন হয়েছে। ইন্টারনাল এরর।");
            }
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: `You are Maya, a sweet, young, and friendly language mentor. Speak clearly in ${language} and guide the user in Bengali. Keep instructions supportive.`
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error("Initialization Failed:", err);
      startedRef.current = false;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('মাইক্রোফোন ব্যবহারের অনুমতি নেই। ব্রাউজার সেটিংস চেক করুন।');
      } else {
        setError('অডিও সিস্টেম বা সার্ভারে ত্রুটি হয়েছে। মোবাইল রিস্টার্ট দিন অথবা ইন্টারনেট চেক করুন।');
      }
      setStatus('permission_denied');
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (status === 'idle') {
    return (
      <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center p-8 text-center z-[200]">
        <div className="absolute top-4 left-4 text-[7px] text-white/20 font-mono">{COMPONENT_VERSION}</div>
        <div className="relative mb-12">
          <div className="absolute -inset-10 rounded-full bg-pink-500/10 blur-3xl animate-pulse" />
          <div className="w-48 h-48 rounded-[3.5rem] border-4 border-white/20 overflow-hidden shadow-2xl relative z-10 animate-float">
             <img src={MAYA_AVATAR} className="w-full h-full object-cover" alt="Maya" />
          </div>
        </div>
        
        <h2 className="text-3xl font-black text-white mb-2 tracking-tighter">সেশন শুরু করতে তৈরি?</h2>
        <p className="text-gray-400 mb-10 max-w-xs leading-relaxed font-medium">মায়া আপনার জন্য অপেক্ষা করছে। মাইক্রোফোন চালু করে কথা বলা শুরু করুন।</p>
        
        <div className="space-y-4 w-full max-w-xs">
          <button 
            onClick={handleStartCall}
            className="w-full bg-pink-500 text-white py-6 rounded-3xl font-black uppercase tracking-widest shadow-[0_20px_40px_rgba(236,72,153,0.3)] active:scale-95 transition-all flex items-center justify-center"
          >
            মায়ার সাথে কথা বলুন
          </button>
          <button onClick={onEnd} className="w-full bg-white/5 text-gray-500 py-4 rounded-3xl font-bold uppercase text-[10px] tracking-widest">ফিরে যান</button>
        </div>
      </div>
    );
  }

  if (status === 'permission_denied') {
    return (
      <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center p-8 text-center z-[200]">
        <div className="w-24 h-24 bg-rose-500/20 rounded-full flex items-center justify-center text-5xl mb-6 border border-rose-500/50">🚫</div>
        <h2 className="text-2xl font-black text-white mb-4">অ্যাক্সেস এরর</h2>
        <p className="text-gray-400 mb-8 max-w-sm leading-relaxed">{error || 'সংযোগ স্থাপন করা যায়নি।'}</p>
        <div className="space-y-4 w-full max-w-xs">
          <button 
            onClick={() => { startedRef.current = false; handleStartCall(); }}
            className="w-full bg-pink-500 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all"
          >
            আবার চেষ্টা করুন
          </button>
          <button onClick={onEnd} className="w-full bg-white/5 text-gray-400 py-4 rounded-2xl font-bold uppercase text-xs tracking-widest">ফিরে যান</button>
        </div>
      </div>
    );
  }

  if (status === 'summary') {
    return (
      <div className="fixed inset-0 bg-white z-[100] flex flex-col items-center pt-10 px-6 overflow-y-auto pb-20">
        <div className="w-24 h-24 bg-pink-100 rounded-full flex items-center justify-center text-4xl mb-4 shadow-xl">🌸</div>
        <h2 className="text-3xl font-black text-gray-900 tracking-tighter">সেশন সামারি</h2>
        <div className="mt-4 flex space-x-2">
           <span className="bg-gray-100 px-4 py-1.5 rounded-full text-[10px] font-black uppercase text-gray-500 tracking-widest">সময়: {formatTime(elapsed)}</span>
        </div>
        <div className="w-full max-w-lg mt-10 space-y-6">
          <div className="bg-gray-50 p-8 rounded-[2.5rem] border border-gray-100 relative overflow-hidden min-h-[300px]">
             <h4 className="text-lg font-black text-indigo-600 mb-6 flex items-center">📝 কারেকশন নোট</h4>
             <div className={`space-y-6 transition-all duration-500 ${isNotesLocked ? 'blur-md pointer-events-none select-none grayscale' : ''}`}>
               {isGeneratingReport ? (
                 <div className="flex flex-col items-center py-10 space-y-4">
                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs font-bold text-gray-400">রিপোর্ট তৈরি হচ্ছে...</p>
                 </div>
               ) : correctionReport.length > 0 ? (
                  correctionReport.map((c, i) => (
                    <div key={i} className="space-y-2 border-b border-gray-100 pb-4 last:border-0">
                       <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">"{c.original}"</p>
                       <p className="text-sm font-black text-gray-800">সঠিক: "{c.corrected}"</p>
                    </div>
                  ))
               ) : (
                 <p className="text-center text-gray-400 py-6 font-bold text-sm">চমৎকার সেশন হয়েছে!</p>
               )}
             </div>
             {isNotesLocked && !isGeneratingReport && correctionReport.length > 0 && (
               <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50/20 backdrop-blur-[2px] z-10 px-8 text-center">
                  <button onClick={() => setIsNotesLocked(false)} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all">
                    Unlock Notes (10 Credits)
                  </button>
               </div>
             )}
          </div>
          <button onClick={onEnd} className="w-full bg-gray-900 text-white py-6 rounded-3xl font-black text-lg active:scale-95 transition-all uppercase tracking-widest">ফিরে যান</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-950 text-white z-[60] flex flex-col overflow-hidden">
      <div className={`absolute inset-0 bg-gradient-to-b from-pink-500/10 to-transparent transition-opacity duration-1000 ${isSpeaking ? 'opacity-100' : 'opacity-30'}`} />
      
      <div className="relative z-10 p-6 flex justify-between items-center bg-gray-950/40 backdrop-blur-md">
        <button onClick={handleEndCall} className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 active:scale-90">
          <svg className="w-6 h-6 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7"></path></svg>
        </button>
        <div className="text-center">
          <p className="text-pink-500 text-[10px] font-black uppercase tracking-[0.4em] mb-1">Maya AI Live</p>
          <p className="text-xl font-black tracking-tighter">{language} সেশন</p>
        </div>
        <div className="w-16 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-xs font-mono font-black text-indigo-400 border border-white/5 shadow-inner">
          {formatTime(elapsed)}
        </div>
      </div>

      <div className="flex-grow flex flex-col items-center justify-center relative px-6">
        <div className="relative mb-8">
          <div className={`absolute -inset-10 rounded-full bg-pink-500/20 blur-3xl transition-all duration-700 ${isSpeaking ? 'scale-150 opacity-100' : 'scale-100 opacity-20'}`} />
          <div className={`w-64 h-64 rounded-[4rem] border-4 border-white/20 overflow-hidden shadow-2xl relative z-10 animate-float transition-all ${isSpeaking ? 'ring-8 ring-pink-500/20 scale-105 border-pink-500/50' : ''}`}>
             <img src={MAYA_AVATAR} className="w-full h-full object-cover" alt="Maya" />
             {(mayaThinking || status === 'connecting') && (
               <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-20">
                  <div className="flex flex-col items-center space-y-4">
                    <div className="flex space-x-2">
                      <div className="w-3 h-3 bg-white rounded-full animate-bounce" />
                      <div className="w-3 h-3 bg-white rounded-full animate-bounce" style={{animationDelay:'0.2s'}} />
                      <div className="w-3 h-3 bg-white rounded-full animate-bounce" style={{animationDelay:'0.4s'}} />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/60">{loadingStep}</p>
                  </div>
               </div>
             )}
          </div>
        </div>

        <div ref={scrollRef} className="w-full max-w-sm h-24 overflow-y-auto space-y-4 px-4 no-scrollbar text-center mb-8">
           {transcripts.slice(-1).map((t, i) => (
             <div key={i} className="animate-in slide-in-from-bottom-2">
               <div className={`px-6 py-4 rounded-[2rem] text-sm font-bold shadow-2xl ${t.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white/10 text-pink-200 border border-white/10'}`}>
                 {t.text}
               </div>
             </div>
           ))}
        </div>

        <button 
          onClick={handleEndCall} 
          className="bg-rose-600 hover:bg-rose-700 w-full max-w-[280px] py-6 rounded-[2.5rem] flex items-center justify-center space-x-4 border-4 border-rose-400/20 active:scale-95 transition-all shadow-[0_25px_60px_rgba(225,29,72,0.4)] group mb-4"
        >
          <span className="text-lg font-black uppercase tracking-widest text-white">Stop Session</span>
        </button>
      </div>

      <div className="p-8 pb-16 flex justify-center items-center">
        <div className="flex items-center space-x-3 h-16">
          {[...Array(9)].map((_, i) => (
            <div 
              key={i} 
              className={`voice-bar w-1.5 rounded-full transition-all duration-200 ${isSpeaking ? 'bg-pink-500 shadow-[0_0_15px_#ec4899]' : 'bg-white/10 h-2'}`} 
              style={{ animation: isSpeaking ? `bounce 0.6s ease-in-out infinite alternate` : 'none', animationDelay: `${i * 0.08}s` }}
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 bg-rose-600/90 backdrop-blur-md px-10 py-4 rounded-full text-[10px] font-black shadow-2xl animate-in zoom-in border border-rose-400/30 uppercase tracking-widest text-center min-w-[280px]">
          {error}
        </div>
      )}
    </div>
  );
};

export default CallInterface;
