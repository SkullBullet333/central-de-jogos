'use client';

import { motion, useReducedMotion } from 'motion/react';
import { Trophy, Sparkles } from 'lucide-react';

export function FinalDrawAnimation({ countdown, participants, onlyUndrawn = false }: { countdown: number; participants: number; onlyUndrawn?: boolean }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div key="final-draw" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0 } }} className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-8 text-center">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-5 py-2 text-xs font-bold uppercase tracking-[0.25em] text-amber-200"><Sparkles className="h-4 w-4" />O grande momento</div>
        <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-white">Sorteio final</h2>
      </div>
      <div className="relative flex h-56 w-56 sm:h-72 sm:w-72 items-center justify-center">
        <motion.div animate={reducedMotion ? undefined : { scale: [0.9, 1.15, 0.9], opacity: [0.3, 0.7, 0.3] }} transition={{ repeat: Infinity, duration: 3 }} className="absolute inset-0 rounded-full bg-amber-300/20 blur-3xl" />
        <motion.div animate={reducedMotion ? undefined : { rotate: 360 }} transition={{ repeat: Infinity, duration: 3, ease: 'linear' }} className="absolute inset-0 rounded-full border-2 border-amber-200/10 border-t-amber-300 border-r-amber-300/60" />
        <motion.div animate={reducedMotion ? undefined : { rotate: -360 }} transition={{ repeat: Infinity, duration: 5, ease: 'linear' }} className="absolute inset-4 rounded-full border border-dashed border-amber-200/30" />
        <div className="relative flex flex-col items-center gap-2">
          <Trophy className="h-10 w-10 text-amber-300" />
          <motion.span key={countdown} initial={reducedMotion ? false : { scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-8xl font-black tabular-nums text-amber-100" aria-live="polite">{countdown}</motion.span>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-lg font-bold text-amber-100">{onlyUndrawn ? 'Uma nova chance para quem ainda não ganhou.' : 'Todos os aptos. Um único ganhador.'}</p>
        <p className="text-sm text-white/60">{participants.toLocaleString('pt-BR')} participantes aptos na disputa</p>
      </div>
    </motion.div>
  );
}
