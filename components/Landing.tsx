
import React from 'react';

interface LandingProps {
  onStart: () => void;
}

const MAYA_AVATAR = "https://images.unsplash.com/photo-1594744803329-e58b31de8bf5?auto=format&fit=crop&q=80&w=400&h=400";

const Landing: React.FC<LandingProps> = ({ onStart }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden bg-gradient-to-br from-pink-50 via-white to-blue-50">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-72 h-72 bg-pink-200/30 rounded-full blur-[100px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-80 h-80 bg-blue-200/30 rounded-full blur-[100px] animate-pulse"></div>

      <div className="relative z-10 flex flex-col items-center text-center max-w-lg">
        {/* Animated Avatar Container */}
        <div className="relative mb-12">
          <div className="absolute inset-0 bg-pink-500/20 rounded-[4rem] blur-3xl animate-pulse"></div>
          <div className="w-56 h-56 md:w-64 md:h-64 rounded-[4rem] border-8 border-white shadow-2xl overflow-hidden animate-float relative z-10 ring-1 ring-pink-100">
            <img src={MAYA_AVATAR} alt="Maya" className="w-full h-full object-cover" />
          </div>
          {/* Badge */}
          <div className="absolute -bottom-4 -right-4 bg-white px-6 py-2 rounded-2xl shadow-xl border border-pink-50 z-20">
            <span className="text-xl">🌸</span>
          </div>
        </div>

        {/* Text Content */}
        <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tighter leading-tight mb-4">
          মায়া AI মেন্টর-এ <br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-600 to-indigo-600">স্বাগতম!</span>
        </h1>
        
        <p className="text-lg md:text-xl font-bold text-gray-600 mb-2 leading-relaxed px-4">
          ভয়কে জয় করে মায়ার সাথে সরাসরি কথা বলে <br className="hidden md:block"/> ইংরেজি ও জার্মান ভাষা প্র্যাকটিস করুন।
        </p>
        
        <p className="text-sm font-medium text-gray-400 mb-12 uppercase tracking-[0.2em]">
          শিখুন, কথা বলুন এবং জয়ী হোন
        </p>

        {/* Start Button - Updated to Pink */}
        <button 
          onClick={onStart}
          className="group relative w-full md:w-72 py-6 bg-pink-500 rounded-[2.5rem] overflow-hidden shadow-[0_20px_50px_rgba(236,72,153,0.3)] active:scale-95 transition-all duration-300"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-pink-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <span className="relative z-10 text-white font-black text-xl uppercase tracking-widest flex items-center justify-center">
            শুরু করুন 
            <svg className="w-6 h-6 ml-3 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
            </svg>
          </span>
        </button>

        {/* Footer Info */}
        <div className="mt-12 flex items-center space-x-2 opacity-40">
           <div className="w-8 h-px bg-gray-400"></div>
           <span className="text-[10px] font-black uppercase tracking-widest">Powered by Gemini AI</span>
           <div className="w-8 h-px bg-gray-400"></div>
        </div>
      </div>
    </div>
  );
};

export default Landing;
