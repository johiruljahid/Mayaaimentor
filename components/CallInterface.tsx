
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

  // Function to get the API Key from multiple possible environment variable names
  const getApiKey = () => {
    return process.env.API_KEY || (process.env as any).Gemini_API_Key_Maya || (process.env as any).NEXT_PUBLIC_GEMINI_API_KEY;
  };

  useEffect(() => { transcriptsRef.current = transcripts; }, [transcripts]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [transcripts]);

  // handleEndCall: Clean up resources and calculate credit usage.
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

  // generateCorrectionReport: Use Gemini to analyze the session and suggest corrections.
  const generateCorrectionReport = useCallback(async (finalTranscripts: ChatMessage[]) => {
    if (finalTranscripts.length === 0) return;
    setIsGeneratingReport(true);
    
    try {
      const apiKey = getApiKey();
      if (!apiKey) throw new Error("API Key missing");
      
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Mentor Report: Analyze conversation history to identify language mistakes in ${language}. Return JSON array: [{"original": "incorrect phrase", "corrected": "corrected phrase", "explanation": "why it was wrong"}]. Focus on common mistakes.`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          { parts: [{ text: prompt }, { text: JSON.stringify(finalTranscripts) }] }
        ],
        config: { responseMimeType: 'application/json' }
      });
      setCorrectionReport(JSON.parse(response.text || '[]'));
    } catch (err) {
      console.error("Report error:", err);
    } finally {
      setIsGeneratingReport(false);
    }
  }, [language]);

  // handleStartCall: Initialize the Gemini Live API session and media streams.
  const handleStartCall = async () => {
    if (startedRef.current) return;
    
    setError(null);
    setStatus('connecting');
    setLoadingStep('মেন্টর মায়া প্রস্তুত হচ্ছে...');

    try {
      const apiKey = getApiKey();
      if (!apiKey) {
        throw new Error("Vercel-এ API Key পাওয়া যায়নি। দয়া করে Gemini_API_Key_Maya অথবা API_KEY সেট করে রি-ডিপ্লয় করুন।");
      }

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

            const base64EncodedAudioString = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64EncodedAudioString) {
              const { output: outputCtx } = audioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              
              const audioBuffer = await decodeAudioData(
                decode(base64EncodedAudioString),
                outputCtx,
                24000,
                1
              );
              
              const source = outputCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputCtx.destination);
              source.addEventListener('ended', () => {
                activeSources.current.delete(source);
                if (activeSources.current.size === 0) setIsSpeaking(false);
              });
              
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
              const msgs: ChatMessage[] = [];
              if (currentInputTrans.current) msgs.push({ role: 'user', text: currentInputTrans.current });
              if (currentOutputTrans.current) msgs.push({ role: 'maya', text: currentOutputTrans.current });
              
              if (msgs.length > 0) {
                setTranscripts(prev => [...prev, ...msgs]);
              }
              currentInputTrans.current = '';
              currentOutputTrans.current = '';
            }
          },
          onerror: (e) => {
            console.error("Live API error:", e);
            setError("কানেকশন সমস্যা হয়েছে। এপিআই কি (API Key) সঠিক কিনা পরীক্ষা করুন।");
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
          systemInstruction: `You are Maya, a sweet, patient, and helpful language mentor. 
          The user is practicing ${language}. Speak naturally and engage in warm conversation. 
          Encourage the user and gently guide their language learning journey.`,
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error("Initialization Error:", err);
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
      <div className="min-h-screen bg-white p-6 md:p-12 overflow-y-auto animate-in fade-in">
        <div className="max-w-2xl mx-auto space-y-10">
          <div className="text-center space-y-4">
            <h2 className="text-4xl font-black text-gray-900 tracking-tighter">সেশন শেষ! 🌸</h2>
            <p className="text-gray-500 font-bold italic">আপনি মায়ার সাথে {formatTime(elapsed)} সময় কথা বলেছেন।</p>
          </div>

          <div className="space-y-6">
            <h3 className="text-2xl font-black text-gray-800 tracking-tight">কারেকশন রিপোর্ট 📝</h3>
            {isGeneratingReport ? (
              <div className="p-12 text-center text-gray-400 font-black animate-pulse bg-gray-50 rounded-[2.5rem] border-2 border-dashed border-gray-100">
                মায়া আপনার কথাগুলো বিশ্লেষণ করছে...
              </div>
            ) : correctionReport.length > 0 ? (
              <div className="space-y-4">
                {correctionReport.map((c, i) => (
                  <div key={i} className="p-8 bg-pink-50 rounded-[2.5rem] border border-pink-100 shadow-sm space-y-3">
                    <p className="text-sm text-red-500 line-through font-bold opacity-60">{c.original}</p>
                    <p className="text-xl text-emerald-600 font-black">{c.corrected}</p>
                    <p className="text-xs text-gray-500 font-medium italic border-t border-pink-100 pt-2">{c.explanation}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center text-gray-400 font-bold bg-gray-50 rounded-[2.5rem]">
                অপূর্ব! আপনার কথা বলা একদম নির্ভুল ছিল।
              </div>
            )}
          </div>

          <button onClick={onEnd} className="w-full py-6 bg-gray-950 text-white rounded-[2.5rem] font-black text-lg shadow-2xl active:scale-95 transition-all uppercase tracking-widest">
            ড্যাশবোর্ড-এ ফিরে যান
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-pink-50 z-50 flex flex-col animate-in fade-in">
      <div className="flex-grow flex flex-col items-center justify-center p-6 space-y-12">
        <div className="relative">
          <div className={`w-48 h-48 md:w-64 md:h-64 rounded-[4.5rem] overflow-hidden border-8 border-white shadow-2xl transition-all duration-700 ${isSpeaking ? 'scale-110 ring-8 ring-pink-200 rotate-2' : 'scale-100'}`}>
            <img src={MAYA_AVATAR} className="w-full h-full object-cover" alt="Maya" />
          </div>
          {isSpeaking && <div className="absolute inset-0 rounded-[4.5rem] border-4 border-pink-400 animate-ping opacity-20"></div>}
        </div>

        <div className="text-center space-y-4">
          <h2 className="text-3xl font-black text-gray-900 tracking-tighter">
            {status === 'connecting' ? loadingStep : isSpeaking ? 'মায়া কথা বলছে...' : 'মায়া শুনছে...'}
          </h2>
          <div className="inline-block bg-white px-8 py-3 rounded-full shadow-lg">
            <p className="text-pink-600 font-black text-3xl tracking-[0.2em]">{formatTime(elapsed)}</p>
          </div>
          {error && <p className="text-red-500 font-black bg-red-50 px-6 py-3 rounded-2xl border border-red-100 shadow-sm max-w-xs mx-auto">{error}</p>}
        </div>

        <button 
          onClick={handleEndCall} 
          className="group w-24 h-24 bg-red-500 text-white rounded-full flex items-center justify-center shadow-[0_20px_50px_rgba(239,68,68,0.4)] active:scale-90 transition-all hover:bg-red-600 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
          <svg className="w-12 h-12 relative z-10" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <div ref={scrollRef} className="h-64 bg-white/60 backdrop-blur-2xl overflow-y-auto p-8 space-y-6 border-t border-white/20">
        <div className="max-w-xl mx-auto space-y-4">
          {transcripts.length === 0 && (
            <p className="text-center text-gray-300 font-bold text-sm tracking-widest uppercase">আড্ডা শুরু করুন...</p>
          )}
          {transcripts.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
              <div className={`max-w-[85%] px-6 py-4 rounded-3xl text-sm font-bold shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none border border-pink-50'}`}>
                {m.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CallInterface;
