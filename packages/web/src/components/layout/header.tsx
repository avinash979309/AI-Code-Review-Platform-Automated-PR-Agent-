import Link from 'next/link';
import { GitPullRequest, Zap } from 'lucide-react';

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-foreground">
          <GitPullRequest className="h-5 w-5 text-primary" />
          <span>CodeRev</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            Dashboard
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Zap className="h-3.5 w-3.5 text-yellow-400" />
          AI Code Review Platform
        </div>
      </div>
    </header>
  );
}
