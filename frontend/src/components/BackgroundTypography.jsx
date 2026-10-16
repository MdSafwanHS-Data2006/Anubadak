import React from 'react';

const DECORATIVE_PHRASES = [
  { text: 'Hello', lang: 'en', className: 'bg-word bg-word-1' },
  { text: 'হ্যালো', lang: 'bn', className: 'bg-word bg-word-2' },
  { text: 'Hola', lang: 'es', className: 'bg-word bg-word-3' },
  { text: 'Good morning', lang: 'en', className: 'bg-word bg-word-4 bg-word-wide-screen' },
  { text: 'সুপ্রভাত', lang: 'bn', className: 'bg-word bg-word-5' },
  { text: 'Buenos días', lang: 'es', className: 'bg-word bg-word-6 bg-word-wide-screen' },
  { text: 'Thank you', lang: 'en', className: 'bg-word bg-word-7 bg-word-wide-screen' },
  { text: 'ধন্যবাদ', lang: 'bn', className: 'bg-word bg-word-8' },
  { text: 'Gracias', lang: 'es', className: 'bg-word bg-word-9' },
];

export default function BackgroundTypography() {
  return (
    <div
      className="bg-layer"
      aria-hidden="true"
      data-testid="background-typography"
    >
      {/* Subtle geometric web lines inspired by Spider-Man and Aero glass depth */}
      <svg
        className="bg-web-svg"
        viewBox="0 0 1440 900"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <g stroke="currentColor" strokeWidth="1">
          <line x1="1280" y1="80" x2="0" y2="320" />
          <line x1="1280" y1="80" x2="240" y2="900" />
          <line x1="1280" y1="80" x2="780" y2="900" />
          <line x1="1280" y1="80" x2="1440" y2="820" />
          <line x1="1280" y1="80" x2="1440" y2="260" />
          <line x1="1280" y1="80" x2="620" y2="0" />
          <circle cx="1280" cy="80" r="110" />
          <circle cx="1280" cy="80" r="240" />
          <circle cx="1280" cy="80" r="410" />
          <circle cx="1280" cy="80" r="620" />
          <circle cx="1280" cy="80" r="880" />
        </g>
      </svg>

      <div className="bg-glow bg-glow-blue" />
      <div className="bg-glow bg-glow-cyan" />
      <div className="bg-glow bg-glow-red" />

      <div className="bg-words-container">
        {DECORATIVE_PHRASES.map((item) => (
          <span
            key={`${item.lang}-${item.text}`}
            lang={item.lang}
            className={item.className}
          >
            {item.text}
          </span>
        ))}
      </div>
    </div>
  );
}
