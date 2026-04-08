import Image from "next/image";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-linear-to-br from-zinc-50 to-zinc-200 p-24 dark:from-zinc-950 dark:to-black">
      <div className="z-10 w-full max-w-5xl items-center justify-center font-mono text-sm flex">
        <div className="relative flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-white/50 p-12 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-black/50 overflow-hidden">
          {/* Decorative background glow */}
          <div className="absolute -z-10 h-48 w-48 rounded-full bg-blue-500/20 blur-3xl" />
          
          <Image
            className="relative dark:invert mb-8 opacity-80 transition-opacity hover:opacity-100"
            src="/next.svg"
            alt="Next.js Logo"
            width={180}
            height={37}
            priority
          />
          
          <div className="bg-linear-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl mb-6">
              Running in Docker
            </h1>
          </div>

          <p className="mt-2 text-center text-lg leading-8 text-zinc-600 dark:text-zinc-400 max-w-md">
            Successfully deployed using Nginx and pnpm in a static export environment.
          </p>

          <div className="mt-10 flex items-center justify-center gap-x-6">
            <a
              href="https://nextjs.org/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-700 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 transition-all duration-200"
            >
              Read Docs
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
