import React from 'react';

/**
 * Safe, XSS-free Markdown & Code-Block renderer for assistant responses and summaries.
 * Never uses dangerouslySetInnerHTML on untrusted user/document strings.
 */
export function SafeMarkdown({ content }: { content: string }) {
  if (!content) return null;

  // Split by fenced code blocks ```lang ... ```
  const blocks = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
      {blocks.map((block, bIdx) => {
        if (block.startsWith('```') && block.endsWith('```')) {
          const lines = block.slice(3, -3).trim().split('\n');
          const firstLine = lines[0]?.trim() || '';
          const hasLang = /^[a-zA-Z0-9_-]+$/.test(firstLine);
          const codeBody = hasLang ? lines.slice(1).join('\n') : lines.join('\n');
          return (
            <pre
              key={bIdx}
              className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-3.5 font-mono text-xs text-slate-100"
            >
              <code>{codeBody}</code>
            </pre>
          );
        }

        const paragraphs = block.split('\n');
        return (
          <div key={bIdx} className="space-y-1.5">
            {paragraphs.map((line, lIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={lIdx} className="h-1" />;

              if (trimmed.startsWith('### ')) {
                return (
                  <h4
                    key={lIdx}
                    className="pt-2 text-sm font-bold tracking-tight text-slate-900 dark:text-white"
                  >
                    {renderInlineFormatting(trimmed.slice(4))}
                  </h4>
                );
              }
              if (trimmed.startsWith('## ')) {
                return (
                  <h3
                    key={lIdx}
                    className="pt-2 text-base font-bold tracking-tight text-slate-900 dark:text-white"
                  >
                    {renderInlineFormatting(trimmed.slice(3))}
                  </h3>
                );
              }
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <div key={lIdx} className="flex items-start gap-2 pl-1">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600 dark:bg-blue-400" />
                    <span className="flex-1">{renderInlineFormatting(trimmed.slice(2))}</span>
                  </div>
                );
              }
              return <p key={lIdx}>{renderInlineFormatting(trimmed)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

function renderInlineFormatting(text: string): React.ReactNode[] {
  // Tokenize **bold** and `[Source ...]` badges safely
  const parts = text.split(/(\*\*[^*]+\*\*|\[Source[^\]]+\])/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-slate-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('[Source') && part.endsWith(']')) {
      return (
        <span
          key={idx}
          className="mx-0.5 inline-flex items-center rounded bg-blue-100 dark:bg-blue-950 px-1.5 py-0.5 text-[11px] font-semibold text-blue-800 dark:text-blue-300"
        >
          {part}
        </span>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

