
// CallInterface.tsx: Implementation of Maya AI Mentor voice interface using Gemini Live API.
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { auth, db } from '../firebase';
import { Language } from '../types';
import { createBlob, decode, decodeAudioData } from '../utils/audio-helpers';
import { doc, increment, updateDoc } from 'firebase/firestore';

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

const CallInterface: React.FC<CallInterfaceProps> = ({ language, onEnd }) => {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'summary' | 'permission_denied'>('idle');
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [elapsed, setElapsed] = useState(0); 
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<ChatMessage[]>([]);
  const [correctionReport, setCorrectionReport] = useState<Correction[]>([]);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  
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

  // Robust API Key Retrieval
  const getApiKey = () => {
    // Check various common naming conventions
    const key = process.env.API_KEY || 
                (process.env as any).Gemini_API_Key_Maya || 
                (process.env as any).NEXT_PUBLIC_GEMINI_API_KEY;
    
    // Log for internal diagnostics (only visible in dev console)
    if (!key) console.warn("Diagnostic: API Key not found in common env locations.");
    return key;
  };

  useEffect(() => { transcriptsRef.current = transcripts; }, [transcripts]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [transcripts]);

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
  }, [transcriptsRef]);

  const generateCorrectionReport = useCallback(async (finalTranscripts: ChatMessage[]) => {
    if (finalTranscripts.length === 0) return;
    setIsGeneratingReport(true);
    
    try {
      const apiKey = getApiKey();
      if (!apiKey) throw new Error("API Key missing");
      
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Mentor Report: Analyze conversation history to identify language mistakes in ${language}. Return JSON array: [{"original": "incorrect phrase", "corrected": "corrected phrase", "explanation": "why it was wrong"}]. Focus on common mistakes. Respond in Bengali for explanations.`;
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

  const handleStartCall = async () => {
    if (startedRef.current) return;
    
    setError(null);
    setStatus('connecting');
    setLoadingStep('মেন্টর মায়া প্রস্তুত হচ্ছে...');

    try {
      const apiKey = getApiKey();
      
      if (!apiKey) {
        throw new Error("এপিআই কি (API Key) পাওয়া যায়নি। দয়া করে Vercel-এ 'Gemini_API_Key_Maya' অথবা 'API_KEY' নামে ভেরিয়েবলটি যোগ করুন এবং Redeploy দিন।");
      }

      setLoadingStep('মাইক্রোফোন চালু হচ্ছে...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
      });
      streamRef.current = stream;

      const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
      const inputCtx = new AudioCtx({ sampleRate: 16000 });
      const outputCtx = new AudioCtx({ sampleRate: 24000 });
      
      if (inputCtx.state === 'suspended') await inputCtx.resume();
      if (outputCtx.state === 'suspended') await outputCtx.resume();
      
      audioContextRef.current = { input: inputCtx, output: outputCtx };

      setLoadingStep('মায়ার সাথে কানেক্ট হচ্ছে...');
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

            if (message.serverContent?.interrupted) {
              activeSources.current.forEach(s => { try { s.stop(); } catch(e) {} });
              activeSources.current.clear();
              nextStartTimeRef.current = 0;
              setIsSpeaking(false);
            }

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
          },
          onerror: (e) => {
            console.error("Maya Live API Error:", e);
            setError("কানেকশন সমস্যা। অনুগ্রহ করে আপনার এপিআই কি সঠিক কিনা যাচাই করুন।");
          },
          onclose: () => {
            if (!isEndingRef.current) handleEndCall();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          },
          systemInstruction: `You are Maya, a sweet, young, and extremely helpful language mentor from Bangladesh. 
          The user is practicing ${language}. Speak naturally like a human mentor. 
          Respond in ${language} mostly, but use a bit of Bengali for encouragement.
          Be supportive and patient. Help them overcome their fear of speaking.`,
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error("Maya Call Start Error:", err);
      setError(err.message || "মাইক্রোফোন বা কানেকশন সমস্যা!");
      setStatus('idle');
    }
  };

  useEffect(() => {
    handleStartCall();
    return () => {
      if (!isEndingRef.current) handleEndCall();
    };
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (status === 'summary') {
    return (
      <div className="fixed inset-0 bg-white z-[70] flex flex-col items-center pt-10 px-6 overflow-y-auto pb-20 animate-in fade-in">
        <div className="w-24 h-24 bg-pink-100 rounded-full flex items-center justify-center text-4xl mb-6 shadow-xl">🌸</div>
        <h2 className="text-3xl font-black text-gray-900 tracking-tighter">সেশন সামারি</h2>
        <div className="mt-4 flex space-x-2">
           <span className="bg-gray-100 px-4 py-1.5 rounded-full text-[10px] font-black uppercase text-gray-500 tracking-widest">সময়: {formatTime(elapsed)}</span>
        </div>
        
        <div className="w-full max-w-lg mt-12 space-y-6">
          <div className="bg-gray-50 p-8 rounded-[3rem] border border-gray-100">
             <h4 className="text-lg font-black text-indigo-600 mb-6 flex items-center">📝 কারেকশন নোট</h4>
             {isGeneratingReport ? (
                <div className="flex flex-col items-center py-10 space-y-4">
                  <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-bold text-gray-400">মায়া আপনার কথাগুলো যাচাই করছে...</p>
                </div>
             ) : correctionReport.length > 0 ? (
                <div className="space-y-6">
                  {correctionReport.map((c, i) => (
                    <div key={i} className="space-y-2 border-b border-gray-100 pb-4 last:border-0">
                       <p className="text-sm text-red-400 line-through font-bold opacity-60">"{c.original}"</p>
                       <p className="text-base font-black text-gray-800">সঠিক: "{c.corrected}"</p>
                       <p className="text-xs text-gray-500 font-medium italic">{c.explanation}</p>
                    </div>
                  ))}
                </div>
             ) : (
                <p className="text-center text-gray-400 py-10 font-bold text-sm">চমৎকার! ভুল খুঁজে পাওয়া যায়নি।</p>
             )}
          </div>
          <button onClick={onEnd} className="w-full bg-gray-900 text-white py-6 rounded-[2.5rem] font-black text-lg active:scale-95 transition-all uppercase tracking-widest shadow-xl">ড্যাশবোর্ড-এ ফিরে যান</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-pink-50 z-[60] flex flex-col animate-in fade-in">
      <div className="p-6 flex justify-between items-center bg-white/40 backdrop-blur-xl border-b border-white">
        <div className="flex items-center space-x-3">
           <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg border-2 border-pink-500">
              <img src={MAYA_AVATAR} className="w-full h-full object-cover" alt="Maya" />
           </div>
           <div>
              <h2 className="text-lg font-black text-gray-900 leading-none">মায়া AI মেন্টর</h2>
              <span className="text-[9px] font-black text-pink-500 uppercase tracking-widest">{language} Session</span>
           </div>
        </div>
        <div className="bg-white px-5 py-2 rounded-full shadow-md">
           <p className="text-pink-600 font-black text-xl tracking-widest">{formatTime(elapsed)}</p>
        </div>
      </div>

      <div className="flex-grow flex flex-col items-center justify-center p-6 relative">
        <div className="relative mb-10">
          <div className={`absolute -inset-10 rounded-full bg-pink-500/10 blur-3xl transition-all duration-700 ${isSpeaking ? 'scale-150 opacity-100' : 'scale-100 opacity-20'}`} />
          <div className={`w-56 h-56 md:w-64 md:h-64 rounded-[4.5rem] border-8 border-white shadow-2xl transition-all duration-700 relative z-10 animate-float ${isSpeaking ? 'scale-105 rotate-2' : 'grayscale-[20%]'}`}>
             <img src={MAYA_AVATAR} className="w-full h-full object-cover" alt="Maya" />
             {status === 'connecting' && (
               <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                  <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-[10px] font-black text-white uppercase tracking-widest">{loadingStep}</p>
               </div>
             )}
          </div>
        </div>

        <div className="text-center mb-10 h-24 flex items-center justify-center">
           {error ? (
              <div className="bg-rose-50 border border-rose-100 p-6 rounded-[2rem] shadow-xl animate-in zoom-in max-w-xs">
                 <p className="text-rose-600 font-black text-sm leading-relaxed">{error}</p>
              </div>
           ) : (
              <div ref={scrollRef} className="w-full max-w-xs space-y-4 px-4 h-full overflow-y-auto no-scrollbar">
                {transcripts.slice(-1).map((t, i) => (
                  <div key={i} className={`animate-in slide-in-from-bottom-2 px-6 py-4 rounded-[2rem] text-sm font-bold shadow-xl ${t.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-800 border border-pink-50'}`}>
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
          <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <div className="p-8 pb-12 flex justify-center items-center">
        <div className="flex items-center space-x-3 h-12">
          {[...Array(9)].map((_, i) => (
            <div 
              key={i} 
              className={`w-1.5 rounded-full transition-all duration-300 ${isSpeaking ? 'bg-pink-500 shadow-[0_0_10px_#ec4899]' : 'bg-gray-200 h-2'}`} 
              style={{ 
                height: isSpeaking ? `${20 + Math.random() * 40}px` : '8px',
                animation: isSpeaking ? `bounce 0.6s ease-in-out infinite alternate ${i * 0.1}s` : 'none'
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default CallInterface;
