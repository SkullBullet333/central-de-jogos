'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, Trash2, Play, RotateCcw, Users, CheckCircle2, Clock, History, ChevronRight, Download, Camera, Trophy } from 'lucide-react';
import { toPng } from 'html-to-image';
import confetti from 'canvas-confetti';

import { HISTORY_CACHE_KEY, HISTORY_CACHE_TTL, decodeHistory, encodeHistory, getBackupWindow, type RaffleResult, type Participant, type RaffleRoster } from '@/lib/raffle-history';
import { parseConfraternizationImport } from '@/lib/participant-import';
import { parseRaffleReport } from '@/lib/raffle-resume';
import { getDrawCandidates } from '@/lib/raffle-rules';
import { FinalDrawAnimation } from '@/app/components/final-draw-animation';
import { FinalFireworks } from '@/app/components/final-fireworks';

const eventImportOptions = [
  { value: 'new', title: 'Novo sorteio', icon: Upload },
  { value: 'continue', title: 'Continuar sorteio', icon: History },
] as const;
const inputModes = [
  { value: 'text', title: 'Nomes' },
  { value: 'file', title: 'Arquivo' },
  { value: 'number', title: 'Números' },
  { value: 'event', title: 'Confraternização' },
] as const;

export default function RafflePage() {
  const [view, setView] = useState<'config' | 'drawing'>('config');
  const [inputMode, setInputMode] = useState<'text' | 'file' | 'number' | 'event'>('text');
  const [rawText, setRawText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importedFileName, setImportedFileName] = useState('');
  const [eventImportMode, setEventImportMode] = useState<'new' | 'continue'>('new');
  const [eventFileName, setEventFileName] = useState('');
  const [importedParticipants, setImportedParticipants] = useState<Participant[]>([]);
  const [roster, setRoster] = useState<RaffleRoster>({ participants: [], ineligible: [] });
  const [isExporting, setIsExporting] = useState(false);
  const [numberStart, setNumberStart] = useState('1');
  const [numberEnd, setNumberEnd] = useState('100');
  const [winnersCount, setWinnersCount] = useState('1');
  const [customSeconds, setCustomSeconds] = useState('5');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isFinalDraw, setIsFinalDraw] = useState(false);
  const [finalOnlyUndrawn, setFinalOnlyUndrawn] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [winners, setWinners] = useState<Participant[]>([]);
  const [shufflingItem, setShufflingItem] = useState<Participant | null>(null);
  const [shuffleKey, setShuffleKey] = useState(0);
  const [history, setHistory] = useState<RaffleResult[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [cacheActivityAt, setCacheActivityAt] = useState(0);
  const [backupNotice, setBackupNotice] = useState<'warning' | 'expired' | null>(null);
  const [drawnItems, setDrawnItems] = useState<Participant[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exhaustedDialogRef = useRef<HTMLDialogElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const isFullscreenDrawing = view === 'drawing' && isFullscreen;
  const activeFileName = inputMode === 'event' ? eventFileName : importedFileName;
  const winnersAmount = Number(winnersCount);
  const durationSeconds = Number(customSeconds);
  const winnersCountValid = Number.isSafeInteger(winnersAmount) && winnersAmount >= 1;
  const durationValid = Number.isInteger(durationSeconds) && durationSeconds >= 1 && durationSeconds <= 60;
  const settingsValid = winnersCountValid && durationValid;

  const downloadResultsImage = async () => {
    if (!resultsRef.current) return;
    
    try {
      const dataUrl = await toPng(resultsRef.current, {
        cacheBust: true,
        backgroundColor: '#6942C8', // Brand color as fallback
        style: {
          borderRadius: '0',
          padding: '40px'
        }
      });
      
      const link = document.createElement('a');
      link.download = `ganhadores_sorteio_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Erro ao gerar imagem:', err);
      setAlertMessage('Erro ao gerar imagem do sorteio.');
    }
  };

  const downloadHistoryXLSX = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const { downloadRaffleXLSX } = await import('@/lib/raffle-export');
      await downloadRaffleXLSX(history, roster);
    } catch (err) {
      console.error('Erro ao exportar planilha:', err);
      setAlertMessage('Não foi possível gerar o Excel. Tente baixar novamente.');
    } finally {
      setIsExporting(false);
    }
  };
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const shuffleRef = useRef<NodeJS.Timeout | null>(null);
  const drawingActiveRef = useRef(false);
  const historyEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const value = localStorage.getItem(HISTORY_CACHE_KEY);
      const cached = value ? decodeHistory(value) : null;
      if (cached) {
        setHistory(cached.history);
        setDrawnItems(cached.history.flatMap(result => result.winners));
        setCacheActivityAt(cached.activityAt ?? 0);
        setRoster(cached.roster ?? { participants: cached.history.flatMap(result => result.winners), ineligible: [] });
      } else {
        localStorage.removeItem(HISTORY_CACHE_KEY);
      }
    } catch (err) {
      console.error('Erro ao restaurar histórico:', err);
      setAlertMessage('O navegador não permitiu restaurar o histórico salvo.');
    }
    setHistoryLoaded(true);
  }, []);

  useEffect(() => {
    if (!historyLoaded) return;
    let expirationTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const expiresAt = history.length ? Math.max(history[history.length - 1].timestamp.getTime(), cacheActivityAt) + HISTORY_CACHE_TTL : 0;
      if (!history.length || expiresAt <= Date.now()) {
        localStorage.removeItem(HISTORY_CACHE_KEY);
      } else {
        localStorage.setItem(HISTORY_CACHE_KEY, encodeHistory(history, roster, cacheActivityAt));
        expirationTimer = setTimeout(() => {
          try { localStorage.removeItem(HISTORY_CACHE_KEY); } catch { /* Storage may become unavailable. */ }
        }, expiresAt - Date.now());
      }
    } catch (err) {
      console.error('Erro ao salvar histórico:', err);
      setAlertMessage('Não foi possível salvar o histórico neste navegador. Baixe o Excel para guardar os resultados.');
    }
    return () => clearTimeout(expirationTimer);
  }, [historyLoaded, history, roster, cacheActivityAt]);

  useEffect(() => {
    if (!historyLoaded || !history.length) {
      setBackupNotice(null);
      return;
    }
    const activityAt = Math.max(history[history.length - 1].timestamp.getTime(), cacheActivityAt);
    const updateNotice = () => setBackupNotice(getBackupWindow(activityAt).status);
    const { warningAt, expiresAt } = getBackupWindow(activityAt);
    updateNotice();
    const warningTimer = setTimeout(updateNotice, Math.max(0, warningAt - Date.now()));
    const expirationTimer = setTimeout(updateNotice, Math.max(0, expiresAt - Date.now()));
    document.addEventListener('visibilitychange', updateNotice);
    return () => {
      clearTimeout(warningTimer);
      clearTimeout(expirationTimer);
      document.removeEventListener('visibilitychange', updateNotice);
    };
  }, [historyLoaded, history, cacheActivityAt]);

  useEffect(() => {
    if (history.length > 0) {
      historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history]);

  useEffect(() => {
    if (alertMessage) {
      const t = setTimeout(() => setAlertMessage(null), 5000);
      return () => clearTimeout(t);
    }
  }, [alertMessage]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (timerRef.current) clearInterval(timerRef.current);
      if (shuffleRef.current) clearInterval(shuffleRef.current);
    };
  }, []);

  // Derive items from rawText or number range
  const items = React.useMemo(() => {
    if (inputMode === 'event') return importedParticipants;
    if (inputMode === 'number') {
      if (!numberStart.trim() || !numberEnd.trim()) return [];
      const first = Number(numberStart);
      const last = Number(numberEnd);
      if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return [];
      const start = Math.min(first, last);
      const end = Math.max(first, last);
      const list = [];
      for (let i = start; i <= end; i++) {
        list.push({ id: i.toString(), name: i.toString() });
      }
      return list;
    }
    return rawText
      .split(/[;,\r\n]/)
      .map(i => i.trim())
      .filter(i => i.length > 0)
      .map(name => ({ id: name, name }));
  }, [rawText, inputMode, numberStart, numberEnd, importedParticipants]);

  const availableItems = React.useMemo(() => {
    return getDrawCandidates(items, drawnItems);
  }, [items, drawnItems]);
  const finalCandidates = React.useMemo(() => getDrawCandidates(items, drawnItems, true, finalOnlyUndrawn), [items, drawnItems, finalOnlyUndrawn]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setIsImporting(true);

    try {
      if (inputMode === 'event') {
        if (!/\.xlsx$/i.test(file.name)) {
          setAlertMessage('Envie um arquivo Excel (.xlsx).');
          return;
        }
        const reader = await import('read-excel-file/browser');
        const restored = eventImportMode === 'continue' ? parseRaffleReport(await reader.default(file)) : null;
        const imported = restored?.roster ?? parseConfraternizationImport(await reader.readSheet(file, 1));
        const { participants } = imported;
        if (!participants.length) {
          setAlertMessage('Nenhum participante elegível: é necessário estar Aprovado (K) e com check-in Sim (L).');
          return;
        }
        setImportedParticipants(participants);
        setRoster(imported);
        setEventFileName(file.name);
        setHistory(restored?.history ?? []);
        setDrawnItems(restored?.history.flatMap(result => result.winners) ?? []);
        setCacheActivityAt(restored ? Date.now() : 0);
        setWinners([]);
        setShowClearConfirm(false);
        if (restored) {
          const drawnCount = new Set(restored.history.flatMap(result => result.winners.map(winner => winner.id))).size;
          setAlertMessage(`Sorteio recuperado: ${drawnCount} já sorteados e ${participants.length - drawnCount} disponíveis.`);
        }
        return;
      }
      let content: string;
      if (/\.xlsx$/i.test(file.name)) {
        const { readSheet } = await import('read-excel-file/browser');
        const rows = await readSheet(file, 1);
        // Use the first column of the first sheet, skipping the header.
        content = rows.slice(1)
          .map(row => row[0] == null ? '' : String(row[0]))
          .join('\n');
      } else if (/\.(csv|txt)$/i.test(file.name)) {
        const lines = (await file.text()).split(/\r\n|\r|\n/);
        // Preserve the existing header handling for text files.
        content = (lines.length > 1 ? lines.slice(1) : lines).join('\n');
      } else {
        setAlertMessage('Formato não suportado. Envie um arquivo CSV, TXT ou XLSX.');
        return;
      }

      if (!content.split(/[;,\r\n]/).some(item => item.trim())) {
        setAlertMessage('Nenhum participante encontrado. Confira os dados após o cabeçalho.');
        return;
      }
      setRawText(content);
      setRoster({ participants: content.split(/[;,\r\n]/).map(name => name.trim()).filter(Boolean).map(name => ({ id: name, name })), ineligible: [] });
      setImportedFileName(file.name);
    } catch (err) {
      console.error('Erro ao importar participantes:', err);
      setAlertMessage(inputMode === 'event'
        ? eventImportMode === 'continue'
          ? 'Não foi possível continuar. Envie o relatório XLSX completo gerado pelo Sorteador, com as três abas.'
          : 'Não foi possível importar. Confira o arquivo XLSX, o cabeçalho na linha 8 e as colunas C, D, K, L e AA.'
        : 'Não foi possível ler o arquivo. Verifique se ele é válido e tente novamente.');
    } finally {
      setIsImporting(false);
    }
  };

  const startRaffle = (finalDraw = false) => {
    if (finalDraw && inputMode !== 'event') return;
    if (!historyLoaded || !settingsValid || items.length === 0 || isImporting || drawingActiveRef.current) return;
    
    const candidates = getDrawCandidates(items, drawnItems, finalDraw, finalOnlyUndrawn);
    if (candidates.length === 0) {
      if (!exhaustedDialogRef.current?.open) exhaustedDialogRef.current?.showModal();
      return;
    }

    let actualWinnersCount = finalDraw ? 1 : winnersAmount;
    if (actualWinnersCount > candidates.length) {
      setAlertMessage(`Apenas ${candidates.length} participantes restantes. Sorteando todos.`);
      actualWinnersCount = candidates.length;
    }

    drawingActiveRef.current = true;
    setRoster({ participants: items, ineligible: inputMode === 'event' ? roster.ineligible : [] });

    // Request Fullscreen
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    }

    setView('drawing');
    setIsFinalDraw(finalDraw);
    setIsDrawing(true);
    setCountdown(durationSeconds);
    setWinners([]);

    // Clear any existing intervals
    if (timerRef.current) clearInterval(timerRef.current);
    if (shuffleRef.current) clearInterval(shuffleRef.current);

    // Countdown logic
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          finishRaffle(actualWinnersCount, candidates, finalDraw);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Shuffling animation logic
    if (!finalDraw) {
      shuffleRef.current = setInterval(() => {
        const randomIndex = Math.floor(Math.random() * candidates.length);
        setShufflingItem(candidates[randomIndex]);
        setShuffleKey(prev => prev + 1);
      }, 100);
    }
  };

  const finishRaffle = (count: number, candidates: Participant[], finalDraw: boolean) => {
    if (!drawingActiveRef.current) return;
    drawingActiveRef.current = false;

    // Clear intervals
    if (timerRef.current) clearInterval(timerRef.current);
    if (shuffleRef.current) clearInterval(shuffleRef.current);

    const pool = [...candidates];
    const selectedWinners: Participant[] = [];

    for (let i = 0; i < count; i++) {
      const randomIndex = Math.floor(Math.random() * pool.length);
      selectedWinners.push(pool[randomIndex]);
      pool.splice(randomIndex, 1);
    }

    setWinners(selectedWinners);
    setIsDrawing(false);
    
    // Calculate start rank before updating drawnItems
    const startRank = drawnItems.length + 1;
    setDrawnItems(prev => [...prev, ...selectedWinners]);
    
    // Add to history with a truly unique ID
    const newResult: RaffleResult = {
      id: Date.now() + Math.random(),
      winners: selectedWinners,
      startRank: startRank,
      timestamp: new Date(),
      ...(finalDraw ? { kind: 'final' as const } : {}),
    };
    setHistory(prev => [...prev, newResult]);

    confetti({
      particleCount: finalDraw ? 300 : 150,
      spread: finalDraw ? 120 : 70,
      origin: { y: 0.6 },
      colors: finalDraw ? ['#6942C8', '#432889', '#D96427', '#FFFFFF'] : ['#6942C8', '#432889', '#D96427']
    });
  };

  const reset = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (shuffleRef.current) clearInterval(shuffleRef.current);
    drawingActiveRef.current = false;
    setWinners([]);
    setIsDrawing(false);
    setIsFinalDraw(false);
    setCountdown(durationSeconds);
    setHistory([]);
    setDrawnItems([]);
    setView('config');
    // We no longer exit fullscreen here to satisfy the request
  };

  const drawAgain = () => {
    startRaffle();
  };

  const exitFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(err => console.warn(err));
    }
  };

  return (
    <main className="h-screen bg-[#F7F7F7] text-[#333333] font-sans flex overflow-hidden">
      <dialog
        ref={exhaustedDialogRef}
        aria-labelledby="exhausted-title"
        aria-describedby="exhausted-description"
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-stone-200 bg-white p-0 text-stone-800 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        <div className="p-6 sm:p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#6942C8]/10 text-[#6942C8]">
            <Users className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 id="exhausted-title" className="text-xl font-black text-[#432889]">Todos os participantes já foram sorteados!</h2>
          <p id="exhausted-description" className="mt-3 text-sm leading-relaxed text-stone-500">Clique em Novo sorteio para recomeçar.</p>
          <form method="dialog" className="mt-6 grid grid-cols-2 gap-3">
            <button className="rounded-xl bg-stone-100 px-4 py-3 text-sm font-bold text-stone-600 hover:bg-stone-200 transition-colors">Entendi</button>
            <button
              type="button"
              onClick={() => { exhaustedDialogRef.current?.close(); reset(); }}
              className="rounded-xl bg-[#6942C8] px-4 py-3 text-sm font-bold text-white hover:bg-[#432889] transition-colors"
            >
              Novo sorteio
            </button>
          </form>
        </div>
      </dialog>
      {backupNotice && (
        <div role="alert" className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] w-[calc(100%-2rem)] max-w-2xl rounded-2xl border border-orange-200 bg-orange-50 p-4 shadow-xl flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-orange-950">{backupNotice === 'warning' ? 'Atenção: o backup vai expirar em breve' : 'O backup automático expirou'}</p>
            <p className="mt-1 text-sm text-orange-900">{backupNotice === 'warning'
              ? 'Após 30 minutos sem um novo sorteio, o backup será apagado. Baixe o arquivo Excel agora para preservar os resultados.'
              : 'Baixe o arquivo Excel antes de fechar ou recarregar a página para preservar os resultados.'}</p>
          </div>
          <button
            type="button"
            onClick={downloadHistoryXLSX}
            disabled={isExporting}
            className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-[#6942C8] px-4 py-3 text-sm font-bold text-white hover:bg-[#432889] disabled:opacity-50 disabled:cursor-wait transition-colors"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {isExporting ? 'Gerando Excel...' : 'Baixar Excel'}
          </button>
        </div>
      )}
      
      {/* Sidebar: History */}
      {!isFullscreenDrawing && (
      <aside
        id="raffle-history"
        tabIndex={0}
        aria-label="Histórico de sorteios. Passe o mouse ou use o teclado para expandir."
        className="group relative hidden md:flex w-12 hover:w-80 focus-visible:w-80 has-[:focus-visible]:w-80 shrink-0 h-full overflow-hidden bg-white border-r border-stone-200 transition-[width] duration-300 ease-in-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#6942C8]"
      >
        <div aria-hidden="true" className="absolute inset-y-0 left-0 w-12 flex flex-col items-center gap-4 py-6 text-[#6942C8] bg-[#6942C8]/5 group-hover:invisible group-focus-visible:invisible group-has-[:focus-visible]:invisible">
          <History className="w-5 h-5 shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-widest [writing-mode:vertical-rl]">Histórico</span>
        </div>
        <div className="invisible group-hover:visible group-focus-visible:visible group-has-[:focus-visible]:visible w-80 shrink-0 h-full flex flex-col">
        <div className="p-6 border-b border-stone-100 bg-[#6942C8]/5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#6942C8]">
            <History className="w-5 h-5" />
            <h2 className="font-black uppercase tracking-tighter text-lg">Histórico</h2>
          </div>
          <div className="flex items-center gap-1">
          {history.length > 0 && (
            <div className="flex items-center gap-1">
              {showClearConfirm ? (
                <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
                  <button 
                    onClick={() => { setHistory([]); setDrawnItems([]); setShowClearConfirm(false); }}
                    className="text-[8px] font-black bg-red-500 text-white px-2 py-1 rounded uppercase tracking-tighter hover:bg-red-600"
                  >
                    Sim
                  </button>
                  <button 
                    onClick={() => setShowClearConfirm(false)}
                    className="text-[8px] font-black bg-stone-200 text-stone-600 px-2 py-1 rounded uppercase tracking-tighter hover:bg-stone-300"
                  >
                    Não
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => setShowClearConfirm(true)}
                  className="p-2 text-stone-400 hover:text-red-500 transition-colors"
                  title="Limpar Histórico"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {history.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <div className="w-12 h-12 bg-stone-50 rounded-full flex items-center justify-center mx-auto">
                <Clock className="w-6 h-6 text-stone-300" />
              </div>
              <p className="text-[10px] font-bold uppercase text-stone-400 tracking-widest">Nenhum sorteio realizado</p>
            </div>
          ) : (
            history.map((result, idx) => (
              <div key={result.id} className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-[#6942C8] uppercase tracking-widest">{result.kind === 'final' ? 'SORTEIO FINAL' : `SORTEIO ${idx + 1}`}</span>
                  <span className="text-[8px] text-stone-400 font-bold">{result.timestamp.toLocaleTimeString()}</span>
                </div>
                <div className="space-y-1">
                  {result.winners.map((winner, winnerIdx) => (
                    <div key={`${result.id}-winner-${winnerIdx}`} className="flex items-center gap-2 text-xs font-bold text-stone-700">
                      <ChevronRight className="w-3 h-3 text-[#D96427]" />
                      <span className="text-[#6942C8] min-w-[24px]">#{result.startRank + winnerIdx}</span>
                      <div className="min-w-0">
                        <span className="break-words">{winner.name}</span>
                        {winner.sector && <p className="text-[10px] font-normal text-stone-500 break-words">{winner.sector}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
          <div ref={historyEndRef} />
        </div>
        </div>
      </aside>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
        
        {/* Header */}
        {!isFullscreenDrawing && (
        <header className="bg-white border-b border-stone-200 p-4 flex items-center justify-between gap-4 z-20">
          <a href="/" className="font-bold rounded-xl px-3 py-2 bg-violet-100 text-violet-900">Central de Jogos</a>
          <div className="text-right">
            <h1 className="text-xl font-black tracking-tighter text-[#6942C8] uppercase leading-none">Sorteador</h1>
          </div>
        </header>
        )}

        <div className="flex-1 relative overflow-y-auto bg-[#F7F7F7] custom-scrollbar">
          {/* Global Alert Notification */}
          <AnimatePresence>
            {alertMessage && (
              <motion.div 
                initial={{ opacity: 0, y: -50 }}
                animate={{ opacity: 1, y: 20 }}
                exit={{ opacity: 0, y: -50 }}
                className="absolute top-0 left-1/2 -translate-x-1/2 z-[100] bg-[#D96427] text-white px-6 py-3 rounded-full shadow-2xl font-bold text-xs uppercase tracking-widest flex items-center gap-3"
              >
                <Clock className="w-4 h-4" />
                {alertMessage}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {view === 'config' ? (
              <motion.div 
                key="config"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="min-h-full flex items-center justify-center p-6"
              >
                <div className="max-w-3xl w-full bg-white border border-stone-200 p-5 sm:p-8 rounded-[2.5rem] shadow-xl space-y-8">
                  <div className="space-y-2 text-center">
                    <h2 className="text-3xl font-black text-[#333333] uppercase tracking-tighter">Configurações Iniciais</h2>
                    <p className="text-xs text-stone-400 font-bold uppercase tracking-widest">Prepare os parâmetros do sorteio</p>
                  </div>

                  <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-1 p-1.5 bg-stone-100 rounded-2xl" aria-label="Tipo de sorteio">
                      {inputModes.map(mode => (
                        <button
                          key={mode.value}
                          type="button"
                          onClick={() => setInputMode(mode.value)}
                          disabled={isImporting}
                          aria-pressed={inputMode === mode.value}
                          className={`h-12 px-2 text-sm md:text-base font-bold rounded-xl transition-all disabled:opacity-50 ${inputMode === mode.value ? 'bg-[#6942C8] text-white shadow-md' : 'text-stone-500 hover:text-[#6942C8]'}`}
                        >
                          {mode.title}
                        </button>
                      ))}
                    </div>

                    <div className="h-80 sm:h-64">
                    {inputMode === 'text' ? (
                      <div className="h-full flex flex-col gap-2">
                        <label className="text-[10px] font-bold uppercase text-stone-400 tracking-widest">Lista de Participantes</label>
                        <textarea 
                          value={rawText}
                          onChange={(e) => setRawText(e.target.value)}
                          placeholder="Ex: João; Maria, Pedro (ou um por linha)"
                          className="w-full flex-1 min-h-0 p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#6942C8]/20 focus:border-[#6942C8] transition-all resize-none font-mono text-sm"
                        />
                      </div>
                    ) : inputMode === 'file' || inputMode === 'event' ? (
                      <div className="h-full flex flex-col gap-2">
                        {inputMode === 'event' && (<fieldset disabled={isImporting} className="shrink-0 pb-2">
                          <legend className="sr-only">Confraternização</legend>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {eventImportOptions.map(option => (
                              <label key={option.value} className="relative flex cursor-pointer disabled:cursor-wait">
                                <input
                                  type="radio"
                                  name="event-import-mode"
                                  value={option.value}
                                  checked={eventImportMode === option.value}
                                  onChange={() => {
                                    setEventImportMode(option.value);
                                    setEventFileName('');
                                    setImportedParticipants([]);
                                  }}
                                  className="peer sr-only"
                                />
                                <div className="w-full rounded-2xl border border-stone-200 bg-white p-3 transition-colors hover:border-[#6942C8]/40 peer-checked:border-[#6942C8] peer-checked:bg-[#6942C8]/5 peer-focus-visible:ring-2 peer-focus-visible:ring-[#6942C8] peer-focus-visible:ring-offset-2 peer-disabled:opacity-50 peer-disabled:cursor-wait">
                                  <div className="flex items-center gap-2">
                                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${eventImportMode === option.value ? 'bg-[#6942C8] text-white' : 'bg-stone-100 text-stone-500'}`}>
                                      <option.icon className="h-4 w-4" aria-hidden="true" />
                                    </div>
                                    <span className="min-w-0 flex-1 break-words text-sm sm:text-base font-bold text-stone-800">{option.title}</span>
                                    {eventImportMode === option.value
                                      ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#6942C8]" aria-hidden="true" />
                                      : <span className="h-4 w-4 shrink-0 rounded-full border border-stone-200" aria-hidden="true" />}
                                  </div>
                                </div>
                              </label>
                            ))}
                          </div>
                        </fieldset>)}
                        {activeFileName ? (
                          <div className="flex-1 min-h-0 flex flex-col overflow-hidden border border-stone-200 rounded-2xl bg-stone-50">
                            <div className="shrink-0 flex items-center justify-between gap-3 p-3 border-b border-stone-200 bg-white">
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-[#6942C8]" role="status">{items.length} participantes carregados{inputMode === 'event' && eventImportMode === 'continue' ? ` · ${availableItems.length} disponíveis` : ''}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold text-[#6942C8] hover:bg-[#6942C8]/5 transition-colors"
                              >
                                Trocar arquivo
                              </button>
                            </div>
                            <ol aria-label="Participantes carregados" tabIndex={0} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1 custom-scrollbar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#6942C8]">
                              {items.map((participant, index) => (
                                <li key={`${index}-${participant.id}`} className="flex items-start gap-3 rounded-lg px-2 py-1.5 text-sm">
                                  <span className="min-w-5 text-xs text-stone-400 pt-0.5">{index + 1}.</span>
                                  <div className="min-w-0 break-words text-stone-700">
                                    <span>{participant.name}</span>
                                    {inputMode === 'event' && eventImportMode === 'continue' && drawnItems.some(drawn => drawn.id === participant.id) && (
                                      <span className="ml-2 inline-block rounded bg-[#6942C8]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#432889]">Já sorteado</span>
                                    )}
                                    {participant.sector && <p className="text-xs text-stone-500">{participant.sector}</p>}
                                  </div>
                                </li>
                              ))}
                            </ol>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isImporting}
                            className="w-full flex-1 min-h-0 p-4 border-2 border-dashed border-stone-200 rounded-2xl flex flex-col items-center justify-center gap-2 hover:border-[#6942C8] hover:bg-[#6942C8]/5 disabled:cursor-wait transition-all group"
                          >
                            <Upload className="w-5 h-5 text-stone-400 group-hover:text-[#6942C8]" />
                            <span className="text-center" role="status">
                              <span className="block text-xs font-bold">{isImporting ? 'Importando participantes...' : inputMode === 'event' ? eventImportMode === 'continue' ? 'Importar sorteio anterior' : 'Importar novo sorteio' : 'Enviar arquivo (pula cabeçalho)'}</span>
                              <span className="block text-[10px] text-stone-400 uppercase font-bold">{inputMode === 'event' ? eventImportMode === 'continue' ? 'Relatório Excel do Sorteador' : 'XLSX da confraternização' : 'CSV, TXT ou XLSX'}</span>
                              <span className="block text-[10px] text-stone-400">{inputMode === 'event' ? eventImportMode === 'continue' ? 'Os participantes já sorteados não serão repetidos.' : 'Somente aprovados com check-in Sim. Cabeçalho na linha 8.' : 'Excel: primeira coluna da primeira aba, com cabeçalho.'}</span>
                            </span>
                          </button>
                        )}
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept={inputMode === 'event' ? '.xlsx' : '.csv,.txt,.xlsx'} disabled={isImporting} className="hidden" />
                      </div>
                    ) : (
                      <section aria-label="Intervalo de números" className="h-full flex flex-col justify-center gap-4 p-5 sm:p-6 bg-linear-to-br from-[#6942C8]/5 to-stone-50 border border-[#6942C8]/15 rounded-2xl">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-lg sm:text-xl font-bold text-[#432889]">Intervalo do sorteio</h3>
                          <span className="rounded-full border border-[#6942C8]/15 bg-white px-3 py-1 text-xs font-bold text-[#432889]">
                            {items.length.toLocaleString('pt-BR')} números
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:gap-5">
                          <div className="space-y-2">
                            <label htmlFor="number-start" className="block text-xs font-semibold text-stone-500">Número inicial</label>
                            <input
                              id="number-start"
                              type="number"
                              value={numberStart}
                              onChange={(e) => setNumberStart(e.target.value)}
                              className="w-full min-w-0 p-3 bg-white border border-stone-200 rounded-2xl text-center text-3xl sm:text-4xl font-bold tabular-nums text-[#432889] shadow-sm focus:outline-none focus:border-[#6942C8] focus:ring-2 focus:ring-[#6942C8]/20 transition-colors"
                            />
                          </div>
                          <div className="space-y-2">
                            <label htmlFor="number-end" className="block text-xs font-semibold text-stone-500">Número final</label>
                            <input
                              id="number-end"
                              type="number"
                              value={numberEnd}
                              onChange={(e) => setNumberEnd(e.target.value)}
                              className="w-full min-w-0 p-3 bg-white border border-stone-200 rounded-2xl text-center text-3xl sm:text-4xl font-bold tabular-nums text-[#432889] shadow-sm focus:outline-none focus:border-[#6942C8] focus:ring-2 focus:ring-[#6942C8]/20 transition-colors"
                            />
                          </div>
                        </div>
                      </section>
                    )}
                    </div>

                    <div className={`grid grid-cols-2 gap-4 ${inputMode === 'event' ? 'sm:grid-cols-3' : ''}`}>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase text-stone-400 tracking-widest flex items-center gap-1.5">
                          <Users className="w-3 h-3" /> Ganhadores
                        </label>
                        <input 
                          type="number" 
                          min="1" 
                          max={availableItems.length || 1}
                          value={winnersCount}
                          onChange={(e) => setWinnersCount(e.target.value)}
                          aria-invalid={winnersCount !== '' && !winnersCountValid}
                          className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-center font-bold focus:outline-none focus:ring-2 focus:ring-[#6942C8]/20"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase text-stone-400 tracking-widest flex items-center gap-1.5">
                          <Clock className="w-3 h-3" /> Segundos
                        </label>
                        <input 
                          type="number" 
                          min="1" 
                          max="60"
                          value={customSeconds}
                          onChange={(e) => setCustomSeconds(e.target.value)}
                          aria-invalid={customSeconds !== '' && !durationValid}
                          className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-center font-bold focus:outline-none focus:ring-2 focus:ring-[#6942C8]/20"
                        />
                      </div>
                      {inputMode === 'event' && (
                        <div className="col-span-2 sm:col-span-1 space-y-2">
                          <span className="block text-[10px] font-bold uppercase text-stone-400 tracking-widest">Sorteio final</span>
                          <label className="flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                            <span className="text-xs font-bold text-stone-600">Só não sorteados</span>
                            <input
                              type="checkbox"
                              role="switch"
                              checked={finalOnlyUndrawn}
                              onChange={e => setFinalOnlyUndrawn(e.target.checked)}
                              aria-label="Sortear apenas quem ainda não ganhou no sorteio final"
                              aria-describedby="final-eligibility-description"
                              className="peer sr-only"
                            />
                            <span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full bg-stone-300 transition-colors peer-checked:bg-[#6942C8] peer-focus-visible:ring-2 peer-focus-visible:ring-[#6942C8] peer-focus-visible:ring-offset-2 after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" />
                          </label>
                        </div>
                      )}
                    </div>
                    {inputMode === 'event' && <p id="final-eligibility-description" className="text-xs text-stone-500">{finalOnlyUndrawn ? 'Ativado: no sorteio final, concorre apenas quem ainda não ganhou.' : 'Desativado: no sorteio final, todos os participantes aptos concorrem novamente.'}</p>}

                    <div className="flex gap-4">
                      <button 
                        onClick={() => startRaffle()}
                        disabled={!historyLoaded || !settingsValid || items.length === 0 || isDrawing || isImporting}
                        className="flex-1 py-5 bg-[#6942C8] text-white rounded-2xl font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-[#432889] disabled:bg-stone-200 disabled:cursor-not-allowed transition-all shadow-xl shadow-[#6942C8]/20"
                      >
                        <Play className="w-5 h-5 fill-current" />
                        {inputMode === 'event' && eventImportMode === 'continue' ? 'Continuar Sorteio' : 'Iniciar Sorteio'}
                      </button>
                      {isFullscreen && (
                        <button 
                          onClick={exitFullscreen}
                          className="px-6 py-5 bg-stone-100 text-stone-500 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-stone-200 transition-all"
                        >
                          Sair Fullscreen
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="drawing"
                initial={{ opacity: 0, scale: 1.1 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`absolute inset-0 ${isFinalDraw ? 'bg-[#102a23]' : 'bg-[#432889]'} flex flex-col items-center justify-start p-8 md:p-12 text-white overflow-hidden`}
              >
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
                <div className="absolute -bottom-48 -right-48 w-96 h-96 bg-[#6942C8] rounded-full blur-[120px] opacity-30"></div>
                <div className="absolute -top-48 -left-48 w-96 h-96 bg-[#D96427] rounded-full blur-[120px] opacity-20"></div>
                {isFinalDraw && !isDrawing && winners.length > 0 && <FinalFireworks />}

                <AnimatePresence mode="wait">
                  {isDrawing && isFinalDraw ? (
                    <FinalDrawAnimation key="final-draw" countdown={countdown} participants={finalCandidates.length} onlyUndrawn={finalOnlyUndrawn} />
                  ) : isDrawing ? (
                    <motion.div 
                      key="active-draw"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0 } }}
                      className="text-center space-y-12 w-full z-10 h-full flex flex-col justify-center"
                    >
                      <div className="relative">
                        <motion.div 
                          animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                          transition={{ repeat: Infinity, duration: 1 }}
                          className="text-[15rem] font-black italic tracking-tighter text-[#D96427] drop-shadow-[0_20px_50px_rgba(244,121,32,0.4)] leading-none"
                        >
                          {countdown}
                        </motion.div>
                        <p className="text-sm font-black uppercase tracking-[0.8em] text-white/40 mt-8">Sorteando Vencedores</p>
                      </div>

                      <div className="h-24 flex items-center justify-center overflow-hidden">
                        <motion.div 
                          key={`shuffle-${shuffleKey}`}
                          initial={{ y: 60, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -60, opacity: 0 }}
                          className="text-4xl font-mono text-white font-black uppercase tracking-tight"
                        >
                          <div>{shufflingItem?.name}</div>
                          {shufflingItem?.sector && <p className="mt-1 text-sm font-medium normal-case tracking-normal text-white/70">{shufflingItem.sector}</p>}
                        </motion.div>
                      </div>

                      <div className="w-full max-w-2xl mx-auto h-3 bg-black/30 rounded-full overflow-hidden border border-white/10 backdrop-blur-md">
                        <motion.div 
                          initial={{ width: "100%" }}
                          animate={{ width: "0%" }}
                          transition={{ duration: durationSeconds, ease: "linear" }}
                          className="h-full bg-[#D96427] shadow-[0_0_20px_rgba(244,121,32,0.8)]"
                        />
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="results"
                      ref={resultsRef}
                      initial={false}
                      className={`w-full ${
                        inputMode === 'number' 
                          ? (isFullscreen ? 'max-w-6xl' : 'max-w-4xl') 
                          : (isFullscreen ? 'max-w-7xl' : 'max-w-5xl')
                      } h-full min-h-0 flex flex-col space-y-6 z-10 transition-all duration-500 py-4`}
                    >
                      <div className="text-center space-y-2 shrink-0 relative">
                        
                        {isFinalDraw && <p className="text-4xl sm:text-5xl font-black text-[#D96427]">Parabéns!</p>}
                        <h2 className={`text-sm font-black uppercase tracking-[0.4em] ${isFinalDraw ? 'text-amber-300' : 'text-[#D96427]'}`}>{isFinalDraw ? 'Ganhador do sorteio final' : 'Ganhadores sorteados'}</h2>
                        <div className="h-1.5 w-48 bg-[#D96427] mx-auto rounded-full shadow-[0_0_15px_rgba(244,121,32,0.5)]"></div>
                        
                        <div className="flex justify-center gap-2 pt-2 md:absolute md:right-0 md:top-0 md:pt-0">
                          <button 
                            onClick={downloadResultsImage}
                            title="Baixar Imagem (PNG)"
                            className="p-2 rounded-full bg-white/5 border border-white/10 text-white/40 hover:text-[#D96427] hover:bg-white/10 transition-all group"
                          >
                            <Camera className="w-5 h-5 group-hover:scale-110 transition-transform" />
                          </button>
                          <button 
                            onClick={downloadHistoryXLSX}
                            disabled={isExporting}
                            title={isExporting ? 'Gerando Excel...' : 'Baixar relatório (XLSX)'}
                            aria-label={isExporting ? 'Gerando Excel...' : 'Baixar relatório (XLSX)'}
                            className="p-2 rounded-full bg-white/5 border border-white/10 text-white/40 hover:text-[#D96427] hover:bg-white/10 disabled:opacity-50 disabled:cursor-wait transition-all group"
                          >
                            <Download className="w-5 h-5 group-hover:scale-110 transition-transform" />
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 custom-scrollbar">
                        <div className={`gap-6 min-h-full w-full flex ${
                          inputMode === 'number' 
                            ? 'flex-wrap justify-center items-center content-center px-10' 
                            : 'flex-col items-center py-8'
                        }`}>
                          {inputMode !== 'number' && <div className="flex-1" />}
                          {winners.map((winner, idx) => {
                          const globalRank = (drawnItems.length - winners.length) + idx + 1;
                          const isNumberMode = inputMode === 'number';
                          const isSingleWinner = winners.length === 1;
                          
                          return (
                            <motion.div 
                              key={`winner-${idx}-${winner.id}`}
                              initial={{ x: -40, opacity: 0 }}
                              animate={{ x: 0, opacity: 1 }}
                              transition={isFinalDraw ? { type: 'spring', stiffness: 120, damping: 14 } : { delay: idx * 0.1 }}
                              className={`${
                                isNumberMode 
                                  ? 'py-4 px-8 flex-col text-center min-w-[160px] aspect-square justify-center' 
                                  : (isFullscreen ? 'py-4 px-10' : 'py-3 px-8') + ' flex-row justify-between w-full max-w-4xl'
                              } ${isFinalDraw ? 'bg-amber-200/10 border-amber-300/50 shadow-amber-300/10' : 'bg-white/10 border-white/20'} border rounded-[1rem] flex items-center group hover:bg-white/20 transition-all backdrop-blur-xl shadow-2xl`}
                            >
                              <div className={`flex min-w-0 items-center ${isNumberMode ? 'flex-col gap-1' : 'gap-4'}`}>
                                {!isFinalDraw && <span className={`${
                                  isNumberMode 
                                  ? 'text-xl mb-1'
                                  : (isFullscreen ? 'text-3xl' : 'text-2xl')
                                } shrink-0 text-amber-200 font-mono font-black tabular-nums`}>#{globalRank}</span>}
                                <div className="min-w-0">
                                <span className={`${
                                  isNumberMode 
                                    ? 'text-6xl' 
                                    : (isFullscreen ? 'text-4xl' : 'text-2xl')
                                } font-black tracking-tighter text-white uppercase break-words`}>{winner.name}</span>
                                {winner.sector && <p className={`${isFullscreen ? 'text-lg' : 'text-sm'} mt-1 font-medium text-white/70 break-words`}>{winner.sector}</p>}
                                </div>
                              </div>
                              <div className={`${
                                isNumberMode 
                                  ? 'w-5 h-5 mt-1' 
                                  : (isFullscreen ? 'w-14 h-14' : 'w-10 h-10')
                              } rounded-full bg-[#D96427] flex items-center justify-center shadow-2xl shadow-[#D96427]/50 shrink-0`}>
                                {isFinalDraw ? <Trophy className={`${isNumberMode ? 'w-3 h-3' : 'w-6 h-6'} text-white`} /> : <CheckCircle2 className={`${isNumberMode ? 'w-2.5 h-2.5' : (isFullscreen ? 'w-8 h-8' : 'w-5 h-5')} text-white`} />}
                              </div>
                            </motion.div>
                          );
                        })}
                        {inputMode !== 'number' && <div className="flex-1" />}
                        </div>
                      </div>

                      <div className="flex flex-wrap justify-center gap-3 pt-6 shrink-0">
                        <button 
                          onClick={drawAgain}
                          className="flex items-center justify-center gap-3 text-white font-black uppercase text-xs tracking-[0.3em] bg-[#D96427] px-10 py-5 rounded-2xl hover:bg-[#d6681a] transition-all shadow-2xl shadow-[#D96427]/30"
                        >
                          <Play className="w-5 h-5 fill-current" />
                          Sortear Novamente
                        </button>
                        {inputMode === 'event' && (<button
                          type="button"
                          onClick={() => startRaffle(true)}
                          className="flex items-center justify-center gap-3 rounded-2xl bg-amber-300 px-7 py-5 text-xs font-black uppercase tracking-widest text-[#102a23] shadow-xl shadow-amber-300/20 hover:bg-amber-200 transition-colors"
                          title={finalOnlyUndrawn ? 'Somente quem ainda não ganhou concorre a um único prêmio' : 'Todos os participantes aptos concorrem novamente a um único prêmio'}
                        >
                          <Trophy className="h-5 w-5" />
                          Sorteio final
                        </button>)}
                        <button 
                          onClick={reset}
                          className="flex items-center justify-center gap-3 text-white font-black uppercase text-xs tracking-[0.3em] bg-white/10 px-10 py-5 rounded-2xl border border-white/20 hover:bg-white/20 transition-all shadow-2xl backdrop-blur-md"
                        >
                          <RotateCcw className="w-5 h-5" />
                          Novo Sorteio
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.1);
        }
        
        /* Dark mode scrollbar for drawing view */
        .drawing-view .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
        }
        .drawing-view .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </main>
  );
}

