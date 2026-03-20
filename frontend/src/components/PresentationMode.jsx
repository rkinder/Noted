import { useEffect } from 'react';
import MDEditor from '@uiw/react-md-editor';

export default function PresentationMode({ title, content, onExit }) {
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onExit();
    };
    document.addEventListener('keydown', handleKey);

    // Request browser fullscreen
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});

    return () => {
      document.removeEventListener('keydown', handleKey);
      if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [onExit]);

  return (
    <div className="fixed inset-0 z-50 bg-surface-950 flex flex-col overflow-hidden">
      {/* Minimal top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-surface-700 flex-shrink-0">
        <span className="text-xs text-gray-600 uppercase tracking-widest select-none">
          Presentation
        </span>
        <button
          onClick={onExit}
          className="text-gray-500 hover:text-white transition flex items-center gap-1.5 text-xs"
          title="Exit (Esc)"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Exit
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-12">
          {title && (
            <h1 className="text-4xl font-bold text-white mb-8 leading-tight">
              {title}
            </h1>
          )}
          <div data-color-mode="dark" className="presentation-content">
            <MDEditor.Markdown
              source={content}
              style={{ background: 'transparent', color: '#e2e8f0', fontSize: '1.125rem', lineHeight: '1.8' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
