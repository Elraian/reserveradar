"use client";

import { Fragment, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Paragraph citations like "(§10)", "§5 lg 2" → small mono badges. We walk
// string children of text-bearing elements and wrap matches; this is the one
// piece of chrome that makes the sourcing visible inline, per the brief.
const CITE_RE = /(\(§[^)]{0,24}\)|§\s?\d+[a-z]?(?:\s?lg\s?\d+)?)/g;

function withCitations(children: ReactNode): ReactNode {
  if (typeof children === "string") return splitString(children);
  if (Array.isArray(children)) {
    return children.map((c, i) => <Fragment key={i}>{withCitations(c)}</Fragment>);
  }
  return children;
}

function splitString(text: string): ReactNode {
  const parts = text.split(CITE_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const label = part.replace(/[()]/g, "").trim();
      return (
        <span key={i} className="rr-cite" title="Viide kaitse-eeskirja paragrahvile">
          {label}
        </span>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

const components: Components = {
  p: ({ children }) => (
    <p className="my-2.5 first:mt-0 last:mb-0 leading-[1.7]">{withCitations(children)}</p>
  ),
  h1: ({ children }) => (
    <h2 className="text-base font-semibold mt-4 mb-2 text-foreground">{withCitations(children)}</h2>
  ),
  h2: ({ children }) => (
    <h3 className="rr-eyebrow mt-5 mb-2 !text-forest">{withCitations(children)}</h3>
  ),
  h3: ({ children }) => (
    <h4 className="text-sm font-semibold mt-3 mb-1.5">{withCitations(children)}</h4>
  ),
  ul: ({ children }) => <ul className="my-2.5 flex flex-col gap-1.5 pl-0">{children}</ul>,
  ol: ({ children }) => (
    <ol className="my-2.5 flex flex-col gap-1.5 list-decimal pl-5">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="flex gap-2.5 leading-[1.6]">
      <span
        aria-hidden
        className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-forest/60"
      />
      <span className="min-w-0 flex-1">{withCitations(children)}</span>
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{withCitations(children)}</strong>
  ),
  em: ({ children }) => (
    <em className="text-muted-foreground not-italic">{withCitations(children)}</em>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-forest underline decoration-forest/40 underline-offset-2 hover:decoration-forest"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rr-mono rounded bg-surface-2 px-1 py-0.5 text-[12.5px] text-foreground">
      {children}
    </code>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-forest/40 pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-hairline" />,
};

export function AnswerMarkdown({ children }: { children: string }) {
  return (
    <div className="text-[14.5px] text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
