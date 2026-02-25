import React from "react";

function renderInlineBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    )
  );
}

export default function ChatMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        // Headings
        const h3Match = /^### (.+)/.exec(line);
        if (h3Match) {
          return (
            <p key={i} className="text-sm font-bold text-foreground mt-2 first:mt-0">
              {renderInlineBold(h3Match[1])}
            </p>
          );
        }
        const h2Match = /^## (.+)/.exec(line);
        if (h2Match) {
          return (
            <p key={i} className="text-base font-bold text-foreground mt-2 first:mt-0">
              {renderInlineBold(h2Match[1])}
            </p>
          );
        }
        const h1Match = /^# (.+)/.exec(line);
        if (h1Match) {
          return (
            <p key={i} className="text-lg font-bold text-foreground mt-2 first:mt-0">
              {renderInlineBold(h1Match[1])}
            </p>
          );
        }

        // Bullet list
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <div key={i} className="flex gap-2 text-sm leading-relaxed">
              <span className="mt-[7px] w-1.5 h-1.5 shrink-0 rounded-full bg-current opacity-40" />
              <span>{renderInlineBold(line.slice(2))}</span>
            </div>
          );
        }

        // Numbered list
        const numMatch = /^(\d+)\. (.+)/.exec(line);
        if (numMatch) {
          return (
            <div key={i} className="flex gap-2 text-sm leading-relaxed">
              <span className="font-bold shrink-0 text-foreground">{numMatch[1]}.</span>
              <span>{renderInlineBold(numMatch[2])}</span>
            </div>
          );
        }

        // Empty line
        if (line.trim() === "") {
          return <div key={i} className="h-1" />;
        }

        // Regular paragraph
        return (
          <p key={i} className="text-sm leading-relaxed">
            {renderInlineBold(line)}
          </p>
        );
      })}
    </div>
  );
}
