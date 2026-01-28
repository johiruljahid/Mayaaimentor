
import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="mt-auto p-8 text-center text-gray-400 text-sm">
      <div className="flex flex-col items-center space-y-4">
        <p>© {new Date().getFullYear()} Maya AI Mentor - Created with ❤️ for Bangladesh</p>
        <div className="flex space-x-4">
          <a href="#" className="hover:text-pink-600 transition-colors">Privacy Policy</a>
          <span className="text-gray-200">|</span>
          <a href="#" className="hover:text-pink-600 transition-colors">Terms of Service</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
