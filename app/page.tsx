'use client';
import { useState, useEffect, useRef } from 'react';

// ============================================================
// 타입 정의
// ============================================================
interface Word {
  id: string;
  en: string;
  ko: string;
  pos: string;
  phonetics: string;
  score: number; // 0=미학습, 1=한번통과, 2=마스터(2번연속정답)
}

interface Chapter {
  id: string;
  date: string;
  title: string;
  words: Word[];
}

type WordDictEntry = { ko: string; pos: string; phonetics: string };
type WordDict = Record<string, WordDictEntry>;

const STORAGE_KEY = 'my_word_storage_v8';
const DICT_KEY = 'word_dictionary_v1';

const MODE_LABELS: Record<'word' | 'phrase' | 'both', string> = {
  word: '단어',
  phrase: '문장',
  both: '복합',
};

// ============================================================
// 유틸리티 함수
// ============================================================

// 레벤슈타인 유사도 (0~1)
const calcSimilarity = (s1: string, s2: string): number => {
  const longer = s1.length >= s2.length ? s1 : s2;
  const shorter = s1.length >= s2.length ? s2 : s1;
  const longerLen = longer.length;
  if (longerLen === 0) return 1.0;
  const costs: number[] = [];
  for (let i = 0; i <= longer.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) costs[j] = j;
      else if (j > 0) {
        let newValue = costs[j - 1];
        if (longer.charAt(i - 1) !== shorter.charAt(j - 1))
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[shorter.length] = lastValue;
  }
  return (longerLen - costs[shorter.length]) / longerLen;
};

const cleanText = (s: string) => s.replace(/[^가-힣a-zA-Z0-9]/g, '').toLowerCase();
const stripVerbEnding = (s: string) => s.replace(/(하다|되다|시키다|게하다|해지다|이다|다)$/, '');

// ────────────────────────────────────────────
// 템플릿(긴 문장) 판별 / placeholder 제거 / 단어 단위 매칭
// ────────────────────────────────────────────
const isTemplateText = (s: string): boolean => {
  if (!s) return false;
  const wordCount = s.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount >= 4) return true;
  if (/[\[\]{}]/.test(s)) return true;
  if (/\bS\s*\+?\s*V\b/i.test(s)) return true;
  if (/동사원형|주제명사|주제|장소|계절|이유|보충\s*설명|상대방\s*의견|내\s*의견|기간|시간/.test(s)) return true;
  return false;
};

const stripPlaceholders = (s: string): string =>
  s
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\bS\s*\+?\s*V\b/gi, ' ')
    .replace(/동사원형|주제명사|주제|장소|계절|이유\s*\d?|보충\s*설명|상대방\s*의견|내\s*의견|기간|시간/g, ' ')
    .replace(/[^\w\s가-힣]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const checkTemplateMatch = (user: string, target: string, isEnToKo: boolean): boolean => {
  const cleanUser = stripPlaceholders(user);
  const cleanTarget = stripPlaceholders(target);
  if (!cleanUser || !cleanTarget) return false;

  const userWords = cleanUser.split(/\s+/).filter(Boolean);
  const targetWords = cleanTarget.split(/\s+/).filter(Boolean);
  if (targetWords.length === 0 || userWords.length === 0) return false;

  // 길이 차이 40% 초과면 실패
  const lenDiffRatio = Math.abs(userWords.length - targetWords.length) / Math.max(targetWords.length, 1);
  if (lenDiffRatio > 0.4) return false;

  if (isEnToKo) {
    // 한국어: 순서 무관 단어 집합 일치 50% 이상
    const userSet = new Set(userWords);
    const matched = targetWords.filter(w => userSet.has(w)).length;
    return matched / targetWords.length >= 0.5;
  } else {
    // 영어: 순서 보존 단어 시퀀스 매칭 70% 이상
    let matched = 0;
    let uIdx = 0;
    for (const tw of targetWords) {
      while (uIdx < userWords.length && userWords[uIdx] !== tw) uIdx++;
      if (uIdx < userWords.length) {
        matched++;
        uIdx++;
      }
    }
    return matched / targetWords.length >= 0.7;
  }
};

// ────────────────────────────────────────────
// 통합 답변 판정
// ────────────────────────────────────────────
const checkAnswer = (userAnswer: string, target: string, isEnToKo: boolean): boolean => {
  if (!userAnswer.trim()) return false;
  const targetOptions = target.split(/[,/|·]/).map(t => t.trim()).filter(Boolean);

  for (const targetOpt of targetOptions) {
    // 템플릿 (긴 문장)이면 단어 단위 매칭으로 위임
    if (isTemplateText(targetOpt) || isTemplateText(userAnswer)) {
      if (checkTemplateMatch(userAnswer, targetOpt, isEnToKo)) return true;
      continue;
    }

    // 단어/짧은 구: 기존 유연 매칭
    const cleanUser = cleanText(userAnswer);
    const cleanTarget = cleanText(targetOpt);
    if (!cleanUser || !cleanTarget) continue;

    if (!isEnToKo) {
      if (cleanUser === cleanTarget) return true;
    } else {
      if (cleanTarget === cleanUser) return true;
      const coreUser = stripVerbEnding(cleanUser);
      const coreTarget = stripVerbEnding(cleanTarget);
      if (coreTarget && coreTarget === coreUser) return true;
      if (coreTarget.length >= 2 && coreUser.length >= 2) {
        if (coreTarget.includes(coreUser) && coreUser.length >= coreTarget.length * 0.4) return true;
        if (coreUser.includes(coreTarget) && coreTarget.length >= coreUser.length * 0.4) return true;
      }
      const similarity = calcSimilarity(cleanUser, cleanTarget);
      const threshold = cleanTarget.length > 6 ? 0.55 : 0.70;
      if (similarity >= threshold) return true;
    }
  }
  return false;
};

// ============================================================
// 글자 단위 영어 스펠링 비교 (Ko→En, 단어/짧은 구)
// ============================================================
const EnglishSpellingDiff = ({ correct, user }: { correct: string; user: string }) => {
  const cLower = correct.toLowerCase();
  const uLower = user.toLowerCase();
  const maxLen = Math.max(cLower.length, uLower.length);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] text-green-700 font-bold tracking-widest uppercase mb-2 text-center">✓ 정답 스펠링</p>
        <div className="flex justify-center gap-1 flex-wrap px-2">
          {correct.split('').map((char, i) => (
            <span
              key={i}
              className="font-mono inline-block min-w-[24px] text-center text-lg font-bold text-green-700 bg-green-50 border-b-[3px] border-green-400 pb-1 rounded-t-sm"
            >
              {char === ' ' ? '·' : char}
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] text-red-600 font-bold tracking-widest uppercase mb-2 text-center">✗ 내가 적은 답 (틀린 글자 빨강)</p>
        <div className="flex justify-center gap-1 flex-wrap px-2">
          {Array.from({ length: maxLen }).map((_, i) => {
            const cChar = cLower[i];
            const uChar = uLower[i];
            const isMatch = cChar !== undefined && uChar !== undefined && cChar === uChar;
            const isMissing = uChar === undefined;
            const display = isMissing ? '_' : (user[i] || '_');
            return (
              <span
                key={i}
                className={`font-mono inline-block min-w-[24px] text-center text-lg font-bold pb-1 border-b-[3px] rounded-t-sm transition-all ${
                  isMatch
                    ? 'text-gray-700 bg-gray-50 border-gray-300'
                    : 'text-red-600 bg-red-100 border-red-500'
                }`}
              >
                {display === ' ' ? '·' : display}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 단어 단위 템플릿 비교 (Ko→En, 긴 문장)
// ============================================================
const TemplateSpellingDiff = ({ correct, user }: { correct: string; user: string }) => {
  const correctWords = correct.split(/\s+/).filter(Boolean);
  const userWords = user.split(/\s+/).filter(Boolean);
  const maxLen = Math.max(correctWords.length, userWords.length);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] text-green-700 font-bold tracking-widest uppercase mb-2 text-center">✓ 정답 (단어 순)</p>
        <div className="flex flex-wrap justify-center gap-1.5">
          {correctWords.map((w, i) => (
            <span
              key={i}
              className="bg-green-50 text-green-800 px-2.5 py-1 rounded-md text-sm font-mono font-bold border border-green-300"
            >
              {w}
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] text-red-600 font-bold tracking-widest uppercase mb-2 text-center">✗ 내가 적은 답 (다른 단어 빨강)</p>
        <div className="flex flex-wrap justify-center gap-1.5">
          {Array.from({ length: maxLen }).map((_, i) => {
            const cw = correctWords[i]?.toLowerCase().replace(/[^\w가-힣]/g, '');
            const uw = userWords[i]?.toLowerCase().replace(/[^\w가-힣]/g, '');
            const isMatch = cw !== undefined && uw !== undefined && cw === uw;
            const isMissing = userWords[i] === undefined;
            const display = userWords[i] || '___';
            return (
              <span
                key={i}
                className={`px-2.5 py-1 rounded-md text-sm font-mono font-bold border ${
                  isMatch
                    ? 'bg-gray-50 text-gray-700 border-gray-200'
                    : isMissing
                    ? 'bg-yellow-50 text-yellow-700 border-yellow-300 border-dashed'
                    : 'bg-red-100 text-red-700 border-red-400'
                }`}
              >
                {display}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 한국어 답변 비교 (En→Ko)
// ============================================================
const KoreanAnswerDiff = ({ targets, user }: { targets: string[]; user: string }) => (
  <div className="space-y-3">
    <div>
      <p className="text-[10px] text-green-700 font-bold tracking-widest uppercase mb-2 text-center">✓ 정답 (모두 인정됨)</p>
      <div className="flex flex-wrap justify-center gap-2">
        {targets.map((t, i) => (
          <span
            key={i}
            className="bg-green-50 text-green-800 px-3 py-1.5 rounded-lg text-base font-bold border border-green-300"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
    <div>
      <p className="text-[10px] text-red-600 font-bold tracking-widest uppercase mb-2 text-center">✗ 내가 적은 답</p>
      <div className="flex justify-center">
        <div className="bg-red-50 px-5 py-2.5 rounded-lg border border-red-300 inline-block max-w-full">
          <span className="text-base font-medium text-gray-700 line-through decoration-red-500 decoration-[3px] break-words">
            {user || '(빈칸)'}
          </span>
        </div>
      </div>
    </div>
  </div>
);

// ============================================================
// 메인 컴포넌트
// ============================================================
export default function AIWordMaster() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzingProgress, setAnalyzingProgress] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [extractMode, setExtractMode] = useState<'word' | 'phrase' | 'both'>('both');

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeWords, setActiveWords] = useState<Word[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [isEnToKo, setIsEnToKo] = useState(true);
  const [isFinished, setIsFinished] = useState(false);

  const [feedback, setFeedback] = useState<{ isCorrect: boolean; target: string; word: Word; userAnswer: string } | null>(null);
  const [streak, setStreak] = useState(0);

  const [sessionTargetPoints, setSessionTargetPoints] = useState(0);
  const [initialSessionWordsCount, setInitialSessionWordsCount] = useState(0);

  const [isAdminMode, setIsAdminMode] = useState(false);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [newWord, setNewWord] = useState({ en: '', ko: '', pos: 'Noun', phonetics: '' });

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const retryBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (feedback && !feedback.isCorrect) {
      setTimeout(() => retryBtnRef.current?.focus(), 50);
    }
  }, [feedback]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed: Chapter[] = JSON.parse(saved);
        const fixed = parsed.map(ch => ({
          ...ch,
          words: ch.words.map(w => ({
            ...w,
            id: w.id || Date.now().toString() + Math.random().toString(36).substring(2),
            score: Number(w.score) || 0,
          })),
        }));
        setChapters(fixed);
      } catch {}
    }
  }, []);

  // ============================================================
  // 저장소 헬퍼
  // ============================================================
  const saveChapters = (newChapters: Chapter[]) => {
    setChapters(newChapters);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newChapters));
  };

  const updateWordScore = (wordId: string, newScore: number) => {
    setChapters(prev => {
      const updated = prev.map(ch => ({
        ...ch,
        words: ch.words.map(w => (w.id === wordId ? { ...w, score: newScore } : w)),
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const getWordDict = (): WordDict => {
    try {
      return JSON.parse(localStorage.getItem(DICT_KEY) || '{}');
    } catch {
      return {};
    }
  };

  const enrichWithDictionary = (words: Word[]): Word[] => {
    const dict = getWordDict();
    const enriched = words.map(w => {
      const key = w.en.toLowerCase().trim();
      if (!key) return w;
      if (dict[key]) {
        const existing = dict[key].ko.split(/,/).map(s => s.trim()).filter(Boolean);
        const incoming = w.ko.split(/,/).map(s => s.trim()).filter(Boolean);
        const merged = Array.from(new Set([...existing, ...incoming])).join(', ');
        const updated = {
          ...w,
          ko: merged,
          pos: dict[key].pos || w.pos,
          phonetics: dict[key].phonetics || w.phonetics,
        };
        dict[key] = { ko: merged, pos: updated.pos, phonetics: updated.phonetics };
        return updated;
      } else {
        dict[key] = { ko: w.ko, pos: w.pos, phonetics: w.phonetics };
        return w;
      }
    });
    localStorage.setItem(DICT_KEY, JSON.stringify(dict));
    return enriched;
  };

  const getFormattedDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  // ============================================================
  // AI 분석
  // ============================================================
  const startAnalysis = async () => {
    if (!text.trim()) return alert('내용을 입력해주세요!');
    setLoading(true);
    setAnalyzingProgress(0);

    try {
      const lines = text.split('\n');
      const chunkSize = 40;
      const chunks: string[] = [];
      for (let i = 0; i < lines.length; i += chunkSize) {
        chunks.push(lines.slice(i, i + chunkSize).join('\n'));
      }
      setTotalChunks(chunks.length);

      let allWords: Word[] = [];
      for (let i = 0; i < chunks.length; i++) {
        setAnalyzingProgress(i + 1);
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: chunks[i], mode: extractMode }),
        });
        if (!res.ok) throw new Error('서버 통신 실패');
        const rawData: Partial<Word>[] = await res.json();
        if (rawData?.length > 0) {
          const dataWithProps = rawData.map(w => ({
            en: w.en || '',
            ko: w.ko || '',
            pos: w.pos || '',
            phonetics: w.phonetics || '',
            id: Date.now().toString() + Math.random().toString(36).substring(2),
            score: 0,
          }));
          allWords = [...allWords, ...dataWithProps];
        }
      }

      const enriched = enrichWithDictionary(allWords);

      const seen = new Set<string>();
      const deduped = enriched.filter(w => {
        const k = w.en.toLowerCase().trim();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      if (deduped.length > 0) {
        const newChapter: Chapter = {
          id: Date.now().toString(),
          date: getFormattedDate(),
          title: `${MODE_LABELS[extractMode]} 꾸러미`,
          words: deduped,
        };
        saveChapters([newChapter, ...chapters]);
        setText('');
        alert(`총 ${deduped.length}개 항목이 저장되었습니다!`);
      } else {
        alert('추출할 텍스트를 찾지 못했습니다.');
      }
    } catch {
      alert('분석 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setAnalyzingProgress(0);
      setTotalChunks(0);
    }
  };

  // ============================================================
  // 게임 로직
  // ============================================================
  const initializeGame = (wordsToPlay: Word[], chapterId: string | null) => {
    const shuffled = [...wordsToPlay].sort(() => Math.random() - 0.5);
    setActiveWords(shuffled);
    setInitialSessionWordsCount(shuffled.length);
    const targetPts = shuffled.reduce((sum, w) => sum + (2 - (Number(w.score) || 0)), 0);
    setSessionTargetPoints(targetPts);
    setActiveChapterId(chapterId);
    setStreak(0);
    setIsFinished(false);
  };

  const playChapter = (chapterId: string) => {
    const chapter = chapters.find(c => c.id === chapterId);
    if (!chapter || chapter.words.length === 0) return alert('단어가 없습니다.');
    let wordsToPlay = chapter.words.filter(w => (Number(w.score) || 0) < 2);
    if (wordsToPlay.length === 0) {
      if (confirm('🎉 이 챕터의 모든 항목을 마스터했습니다! 점수를 초기화하고 다시 복습하시겠습니까?')) {
        const resetWords = chapter.words.map(w => ({ ...w, score: 0 }));
        const updated = chapters.map(ch => (ch.id === chapterId ? { ...ch, words: resetWords } : ch));
        saveChapters(updated);
        wordsToPlay = resetWords;
      } else return;
    }
    initializeGame(wordsToPlay, chapterId);
  };

  const playAllWords = () => {
    if (chapters.length === 0) return alert('저장된 항목이 없습니다.');
    const allWords = chapters.flatMap(ch => ch.words);
    const wordsToPlay = allWords.filter(w => (Number(w.score) || 0) < 2);
    if (wordsToPlay.length === 0) return alert('모든 항목을 마스터했습니다!');
    initializeGame(wordsToPlay, null);
  };

  const handleCheck = () => {
    if (activeWords.length === 0) return;
    const submitted = answer.trim();
    if (!submitted) return;

    const current = activeWords[0];
    const target = isEnToKo ? current.ko : current.en;
    const isCorrect = checkAnswer(submitted, target, isEnToKo);

    if (isCorrect) {
      const newScore = Math.min(2, (Number(current.score) || 0) + 1);
      const updated = { ...current, score: newScore };
      setActiveWords(prev => [updated, ...prev.slice(1)]);
      updateWordScore(current.id, newScore);
      setStreak(s => s + 1);
      setFeedback({ isCorrect: true, target, word: updated, userAnswer: answer });
      setTimeout(() => advanceQueue(true), 800);
    } else {
      setStreak(0);
      setFeedback({ isCorrect: false, target, word: current, userAnswer: answer });
    }
  };

  const advanceQueue = (autoFromCorrect = false) => {
    setActiveWords(prev => {
      if (!prev.length) return prev;
      const [head, ...rest] = prev;
      const score = Number(head.score) || 0;
      const newQueue = score >= 2 ? rest : [...rest, head];
      if (newQueue.length === 0) setIsFinished(true);
      return newQueue;
    });
    setFeedback(null);
    setAnswer('');
    if (!autoFromCorrect) setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleForceCorrect = () => {
    const current = activeWords[0];
    if (!current) return;
    const newScore = Math.min(2, (Number(current.score) || 0) + 1);
    const updated = { ...current, score: newScore };
    setActiveWords(prev => [updated, ...prev.slice(1)]);
    updateWordScore(current.id, newScore);
    setStreak(s => s + 1);
    setFeedback(null);
    setAnswer('');
    setTimeout(() => advanceQueue(false), 0);
  };

  const handleRetry = () => {
    setActiveWords(prev => (prev.length ? [...prev.slice(1), prev[0]] : prev));
    setFeedback(null);
    setAnswer('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const quitGame = () => {
    setActiveWords([]);
    setActiveChapterId(null);
    setInitialSessionWordsCount(0);
    setStreak(0);
    setIsFinished(false);
    setFeedback(null);
  };

  const handleRename = (id: string) => {
    saveChapters(chapters.map(ch => (ch.id === id ? { ...ch, title: editTitle } : ch)));
    setEditingChapterId(null);
  };

  const handleAddWord = () => {
    if (!newWord.en || !newWord.ko) return alert('필수 항목을 적어주세요.');
    if (chapters.length === 0) return alert('먼저 챕터를 생성해주세요.');
    const updated = [...chapters];
    const enriched = enrichWithDictionary([
      { ...newWord, id: Date.now().toString() + Math.random().toString(36).substring(2), score: 0 },
    ]);
    updated[0].words.push(enriched[0]);
    saveChapters(updated);
    setNewWord({ en: '', ko: '', pos: 'Noun', phonetics: '' });
    alert('추가되었습니다.');
  };

  const deleteChapter = (id: string) => {
    if (confirm('삭제하시겠습니까?')) saveChapters(chapters.filter(ch => ch.id !== id));
  };

  // ============================================================
  // 화면 1: 완료
  // ============================================================
  if (isFinished) {
    const completedChapter = activeChapterId ? chapters.find(c => c.id === activeChapterId) : null;
    const isAllMastered = completedChapter
      ? completedChapter.words.every(w => (Number(w.score) || 0) >= 2)
      : false;

    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-gradient-to-br from-yellow-50 via-amber-50 to-blue-50">
        <div className="w-full max-w-md p-10 bg-white rounded-3xl shadow-xl border-2 border-amber-300 text-center">
          <div className="text-7xl mb-6 animate-bounce">🏆</div>
          <h2 className="text-2xl font-bold mb-3 text-gray-800">
            {isAllMastered ? '챕터 완전 정복!' : '세션 완료!'}
          </h2>
          <p className="text-sm text-gray-500 mb-10 font-light leading-relaxed">
            {isAllMastered
              ? `${completedChapter?.title}의 모든 항목을 마스터했습니다 🎉`
              : '이번 세션의 항목들을 모두 처리했습니다.'}
          </p>
          <button
            onClick={quitGame}
            className="w-full bg-gray-900 text-white py-4 rounded-2xl font-light tracking-widest hover:bg-gray-800 transition-all"
          >
            보관함으로 가기
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // 화면 2: 게임 진행
  // ============================================================
  if (activeWords.length > 0 && !isAdminMode) {
    const current = activeWords[0];

    const remainingPoints = activeWords.reduce((sum, w) => sum + (2 - (Number(w.score) || 0)), 0);
    const pointsEarned = sessionTargetPoints - remainingPoints;
    const progress = sessionTargetPoints > 0 ? (pointsEarned / sessionTargetPoints) * 100 : 0;

    const displayNew = activeWords.filter(w => (Number(w.score) || 0) === 0).length;
    const displayHalf = activeWords.filter(w => (Number(w.score) || 0) === 1).length;
    const displayMastered = initialSessionWordsCount - displayNew - displayHalf;
    const displayRemainingHits = remainingPoints;

    const questionText = isEnToKo ? current.en : current.ko;
    const targetsList = (isEnToKo ? current.ko : current.en).split(/[,/|·]/).map(t => t.trim()).filter(Boolean);
    const currentIsTemplate = isTemplateText(questionText) || isTemplateText(targetsList[0] || '');

    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#fafafa]">
        <div className="w-full max-w-md p-8 sm:p-10 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center relative min-h-[600px]">
          <button onClick={quitGame} className="absolute top-8 left-8 text-[10px] text-gray-400 uppercase tracking-widest transition-colors flex items-center gap-1">
            ← QUIT
          </button>
          <div className="absolute top-8 right-8 text-sm font-bold text-orange-500 transition-all">
            {streak >= 3 && `🔥 ${streak} Combo!`}
          </div>

          {/* 진척도 대시보드 */}
          <div className="w-full mt-10 mb-6">
            <div className="flex justify-between items-end mb-2">
              <span className="text-[11px] text-gray-500 font-medium tracking-wide">
                진척도: <span className="text-gray-800">{pointsEarned} / {sessionTargetPoints} 완료</span>
              </span>
              <span className="text-sm font-bold text-gray-800 transition-all duration-300">
                {progress.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden relative shadow-inner mb-4">
              <div
                className="bg-gray-800 h-full transition-all duration-500 ease-out relative"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute top-0 right-0 bottom-0 w-4 bg-white opacity-25 blur-[2px]" />
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex justify-between items-center">
              <div className="flex gap-3 text-[10px] font-medium tracking-wide">
                <span className="text-gray-400">미학습 <span className="text-gray-800 font-bold">{displayNew}</span></span>
                <span className="text-blue-500">1/2 통과 <span className="font-bold">{displayHalf}</span></span>
                <span className="text-green-500">완전 정복 <span className="font-bold">{displayMastered}</span></span>
              </div>
            </div>
          </div>

          {/* 모드 토글 */}
          <div className="flex w-full max-w-[200px] bg-gray-100 p-1 rounded-xl mb-4">
            <button
              onClick={() => { setIsEnToKo(true); setTimeout(() => inputRef.current?.focus(), 50); }}
              className={`flex-1 text-[10px] py-2 rounded-lg uppercase tracking-widest transition-all ${isEnToKo ? 'bg-white shadow-sm text-gray-800 font-bold' : 'text-gray-400'}`}
            >
              En → Ko
            </button>
            <button
              onClick={() => { setIsEnToKo(false); setTimeout(() => inputRef.current?.focus(), 50); }}
              className={`flex-1 text-[10px] py-2 rounded-lg uppercase tracking-widest transition-all ${!isEnToKo ? 'bg-white shadow-sm text-gray-800 font-bold' : 'text-gray-400'}`}
            >
              Ko → En
            </button>
          </div>

          {/* 뱃지 영역 */}
          <div className="h-[24px] mb-2 flex items-center justify-center gap-2">
            {currentIsTemplate && !feedback && (
              <span className="px-3 py-1 text-[10px] font-bold text-purple-600 bg-purple-50 rounded-full">
                📝 템플릿 문장 (단어순 위주 평가)
              </span>
            )}
            {(Number(current.score) || 0) === 1 && !feedback && (
              <span className="px-3 py-1 text-[10px] font-bold text-blue-600 bg-blue-50 rounded-full">
                ⭐ 1/2 마스터
              </span>
            )}
          </div>

          {/* 문제 출제 */}
          <h2 className={`font-normal mb-2 text-gray-800 text-center leading-snug break-words ${
            currentIsTemplate ? 'text-lg px-2' : 'text-3xl'
          }`}>
            {questionText}
          </h2>
          <p className="text-gray-400 text-sm font-light mb-8">
            {current.phonetics}
            <span className="text-[10px] ml-1 opacity-50 border border-gray-200 px-1.5 py-0.5 rounded-full">
              [{current.pos}]
            </span>
          </p>

          {feedback ? (
            <div className={`w-full p-6 rounded-2xl text-center ${feedback.isCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
              <p className={`text-sm mb-4 font-bold tracking-widest ${feedback.isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                {feedback.isCorrect ? '✓ CORRECT!' : '✗ INCORRECT'}
              </p>

              {feedback.isCorrect ? (
                <p className={`text-gray-900 font-bold mb-2 break-words ${
                  isTemplateText(feedback.target) ? 'text-base leading-relaxed' : 'text-xl'
                }`}>
                  {feedback.target}
                </p>
              ) : (
                <div className="mb-6">
                  {isEnToKo ? (
                    <KoreanAnswerDiff targets={targetsList} user={feedback.userAnswer} />
                  ) : currentIsTemplate ? (
                    <TemplateSpellingDiff
                      correct={targetsList[0] || feedback.target}
                      user={feedback.userAnswer}
                    />
                  ) : (
                    <EnglishSpellingDiff
                      correct={targetsList[0] || feedback.target}
                      user={feedback.userAnswer}
                    />
                  )}
                </div>
              )}

              {!feedback.isCorrect && (
                <div className="flex gap-2">
                  <button
                    ref={retryBtnRef}
                    onClick={handleRetry}
                    className="flex-1 bg-gray-900 text-white py-3 rounded-xl text-xs font-light hover:bg-gray-800 focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 transition-all outline-none"
                  >
                    다시하기 (Enter)
                  </button>
                  <button
                    onClick={handleForceCorrect}
                    className="flex-1 bg-white border border-gray-200 text-gray-600 py-3 rounded-xl text-xs font-light hover:bg-gray-50 focus:ring-2 focus:ring-gray-200 transition-all outline-none"
                  >
                    내 답이 맞음 (통과)
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full flex flex-col items-center mt-auto">
              <textarea
                ref={inputRef}
                rows={currentIsTemplate ? 3 : 1}
                className={`w-full px-4 py-3 border-b border-gray-100 bg-transparent mb-4 text-center font-light focus:border-gray-800 outline-none transition-colors resize-none overflow-hidden ${
                  currentIsTemplate ? 'text-base leading-relaxed' : 'text-xl'
                }`}
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleCheck();
                  }
                }}
                placeholder={
                  currentIsTemplate
                    ? isEnToKo
                      ? '한국어 의미 입력 (단어 위주 평가)'
                      : '영어 템플릿 입력 (Shift+Enter 줄바꿈)'
                    : isEnToKo
                    ? '한국어 뜻 입력'
                    : '영어 스펠링 정확히 입력'
                }
                autoFocus
                spellCheck="false"
              />
              <p className="text-[11px] text-blue-600 mb-6 font-medium tracking-wide bg-blue-50 px-4 py-1.5 rounded-full">
                목표 달성까지 남은 정답 횟수: <span className="font-bold text-blue-700">{displayRemainingHits}번</span>
              </p>
              <button
                onClick={handleCheck}
                className="w-full bg-gray-900 text-white py-4 rounded-2xl font-light tracking-widest hover:bg-gray-800 transition-all"
              >
                CHECK (Enter)
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================
  // 화면 3: 메인
  // ============================================================
  return (
    <div className="flex flex-col items-center min-h-screen p-6 bg-[#fafafa] pt-16">
      <div className="w-full max-w-2xl bg-white p-10 rounded-[2rem] shadow-sm border border-gray-100">
        <div className="flex justify-between items-start mb-10">
          <div>
            <h1 className="text-2xl font-normal text-gray-800 tracking-tight">AI Word Master</h1>
            <p className="text-gray-400 mt-1 font-light text-sm">단어 · 템플릿 문장 통합 학습기</p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <button
              onClick={() => setIsAdminMode(!isAdminMode)}
              className={`text-[10px] px-3 py-1.5 border rounded-md transition-colors font-light tracking-wide ${isAdminMode ? 'bg-gray-800 text-white border-gray-800' : 'text-gray-400 border-gray-200 hover:text-gray-600'}`}
            >
              {isAdminMode ? '보관함으로 가기' : '관리자 추가 모드'}
            </button>
            <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
              {(['word', 'phrase', 'both'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setExtractMode(m)}
                  className={`px-4 py-2 text-[11px] rounded-lg tracking-wide transition-all ${extractMode === m ? 'bg-white shadow-sm text-gray-800 font-bold' : 'text-gray-400'}`}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 모드 설명 힌트 */}
        <div className={`mb-6 px-4 py-2.5 rounded-xl border text-[11px] font-medium tracking-wide ${
          extractMode === 'phrase'
            ? 'bg-purple-50 border-purple-200 text-purple-700'
            : extractMode === 'word'
            ? 'bg-blue-50 border-blue-200 text-blue-700'
            : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          {extractMode === 'phrase' && '📝 문장 모드: "This photo might have been taken in"처럼 템플릿 문장을 통째로 추출합니다.'}
          {extractMode === 'word' && '🔤 단어 모드: 단어 단위로 추출하고 동의어를 풍부하게 보강합니다.'}
          {extractMode === 'both' && '🎯 복합 모드: 단어와 템플릿 문장을 동시에 추출합니다.'}
        </div>

        {isAdminMode && (
          <div className="mb-8 p-6 bg-gray-50 rounded-2xl border border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-4 tracking-wide">수동 단어 추가</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <input placeholder="영어 (필수)" value={newWord.en} onChange={e => setNewWord({ ...newWord, en: e.target.value })} className="p-3 rounded-xl border border-gray-200 bg-white text-sm font-light outline-none focus:border-gray-400" />
              <input placeholder="한국어 뜻 (필수, 콤마로 여러개)" value={newWord.ko} onChange={e => setNewWord({ ...newWord, ko: e.target.value })} className="p-3 rounded-xl border border-gray-200 bg-white text-sm font-light outline-none focus:border-gray-400" />
              <input placeholder="유형 (예: Expression)" value={newWord.pos} onChange={e => setNewWord({ ...newWord, pos: e.target.value })} className="p-3 rounded-xl border border-gray-200 bg-white text-sm font-light outline-none focus:border-gray-400" />
              <input placeholder="발음 기호" value={newWord.phonetics} onChange={e => setNewWord({ ...newWord, phonetics: e.target.value })} className="p-3 rounded-xl border border-gray-200 bg-white text-sm font-light outline-none focus:border-gray-400" />
            </div>
            <button onClick={handleAddWord} className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-light tracking-wide hover:bg-blue-700 transition-colors">
              추가하기
            </button>
          </div>
        )}

        <textarea
          className="w-full h-56 p-6 bg-gray-50 border border-gray-100 rounded-2xl mb-6 focus:border-gray-300 outline-none resize-none text-gray-700 font-light leading-relaxed"
          placeholder="여기에 공부한 내용을 냅다 꽂아주세요..."
          value={text}
          onChange={e => setText(e.target.value)}
        />

        <button
          onClick={startAnalysis}
          disabled={loading}
          className="w-full bg-gray-900 text-white py-5 rounded-2xl font-light tracking-[0.2em] hover:bg-gray-800 disabled:bg-gray-400 transition-all mb-16"
        >
          {loading ? (totalChunks > 0 ? `쪼개서 분석 중... (${analyzingProgress}/${totalChunks})` : '단어장 생성 중...') : 'GENERATE CHAPTER'}
        </button>

        <div className="border-t border-gray-50 pt-10">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-lg font-normal text-gray-800">Storage</h2>
            {chapters.length > 0 && (
              <button onClick={playAllWords} className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">
                Play All Words
              </button>
            )}
          </div>

          <div className="space-y-4">
            {chapters.map(ch => {
              const masteredCount = ch.words.filter(w => (Number(w.score) || 0) >= 2).length;
              const totalCount = ch.words.length;
              const isPerfect = totalCount > 0 && masteredCount === totalCount;
              const masteryPct = totalCount > 0 ? (masteredCount / totalCount) * 100 : 0;

              return (
                <div
                  key={ch.id}
                  className={`group p-5 border rounded-2xl transition-all relative overflow-hidden ${
                    isPerfect
                      ? 'bg-gradient-to-br from-yellow-50 via-amber-50 to-blue-50 border-amber-400 shadow-md'
                      : 'bg-white border-gray-100 hover:border-gray-300'
                  }`}
                >
                  {isPerfect && (
                    <div className="absolute top-2 right-2 text-2xl animate-pulse">🏆</div>
                  )}
                  <div className="flex justify-between items-start">
                    <div className="flex-1 mr-4">
                      <p className={`text-[10px] font-medium mb-1 ${isPerfect ? 'text-amber-600' : 'text-gray-300'}`}>
                        {ch.date}
                      </p>
                      {editingChapterId === ch.id ? (
                        <div className="flex gap-2 mt-1">
                          <input
                            className="flex-1 border-b border-gray-800 outline-none text-sm font-light py-1 bg-transparent"
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && handleRename(ch.id)}
                          />
                          <button onClick={() => handleRename(ch.id)} className="text-[10px] text-blue-500 font-bold">SAVE</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-1">
                          <h3 className={`text-sm font-medium ${isPerfect ? 'text-amber-900' : 'text-gray-800'}`}>
                            {ch.title}
                          </h3>
                          <button
                            onClick={() => { setEditingChapterId(ch.id); setEditTitle(ch.title); }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded bg-white"
                          >
                            EDIT
                          </button>
                        </div>
                      )}
                      <p className={`text-[11px] font-medium mt-2 tracking-tighter ${isPerfect ? 'text-amber-700' : 'text-gray-500'}`}>
                        {isPerfect ? '🎉 100% 마스터 완료' : `${masteredCount} / ${totalCount} 마스터 (${masteryPct.toFixed(0)}%)`}
                      </p>
                    </div>
                    <div className="flex gap-2 z-10">
                      <button
                        onClick={() => playChapter(ch.id)}
                        className={`px-4 py-2 text-[10px] font-bold rounded-lg transition-colors border shadow-sm ${
                          isPerfect
                            ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                            : 'bg-gray-50 text-gray-800 border-gray-100 hover:bg-gray-100'
                        }`}
                      >
                        {isPerfect ? '초기화 후 다시' : 'PLAY'}
                      </button>
                      <button
                        onClick={() => deleteChapter(ch.id)}
                        className="p-2 text-red-200 hover:text-red-500 transition-colors"
                      >
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
