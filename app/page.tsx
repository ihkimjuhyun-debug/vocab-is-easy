'use client';
import React, { useState, useEffect, useRef } from 'react';

// ============================================================
// 타입 & 상수
// ============================================================
interface Word {
  id: string;
  en: string;
  ko: string;
  pos: string;
  phonetics: string;
  score: number;
  active: boolean;
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

const newId = () => Date.now().toString() + Math.random().toString(36).substring(2);
const dictKey = (en: string, pos: string) =>
  `${(en || '').toLowerCase().trim()}::${(pos || '').toLowerCase().trim()}`;

// ============================================================
// 텍스트 유틸리티
// ============================================================
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

const isTemplateText = (s: string): boolean => {
  if (!s) return false;
  const wordCount = s.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount >= 4) return true;
  if (/[\[\]{}]/.test(s)) return true;
  if (/\bS\s*\+?\s*V\b/i.test(s)) return true;
  if (/동사원형|주제명사|장소|계절|이유|보충\s*설명|상대방\s*의견|내\s*의견|기간|시간/.test(s)) return true;
  return false;
};
const isTemplatePos = (pos: string): boolean => /template|expression/i.test(pos || '');

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

const isExtraContextPart = (s: string): boolean => {
  const trimmed = s.trim();
  if (trimmed.length < 10) return false;
  if (/^~/.test(trimmed)) return true;
  if (/S\s*\+?\s*V/.test(trimmed)) return true;
  if (trimmed.startsWith('[')) return true;
  if (trimmed.length > 20) return true;
  return false;
};

const extractCoreMeaning = (s: string): string => {
  if (!s) return s;
  const parts = s.split(/,/);
  if (parts.length <= 1) return s;
  const core: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0 && isExtraContextPart(parts[i])) break;
    core.push(parts[i]);
  }
  return core.join(',').trim();
};

// ============================================================
// 답변 판정
// ============================================================
const checkTemplateMatch = (user: string, target: string, isEnToKo: boolean): boolean => {
  const cleanUser = stripPlaceholders(user);
  const cleanTarget = stripPlaceholders(target);
  if (!cleanUser || !cleanTarget) return false;
  const userWords = cleanUser.split(/\s+/).filter(Boolean);
  const targetWords = cleanTarget.split(/\s+/).filter(Boolean);
  if (targetWords.length === 0 || userWords.length === 0) return false;
  const lenDiffRatio = Math.abs(userWords.length - targetWords.length) / Math.max(targetWords.length, 1);
  if (lenDiffRatio > 0.4) return false;
  if (isEnToKo) {
    const userSet = new Set(userWords);
    const matched = targetWords.filter(w => userSet.has(w)).length;
    return matched / targetWords.length >= 0.5;
  }
  let matched = 0;
  let uIdx = 0;
  for (const tw of targetWords) {
    while (uIdx < userWords.length && userWords[uIdx] !== tw) uIdx++;
    if (uIdx < userWords.length) { matched++; uIdx++; }
  }
  return matched / targetWords.length >= 0.7;
};

const checkAnswer = (userAnswer: string, target: string, isEnToKo: boolean): boolean => {
  if (!userAnswer.trim()) return false;
  const coreTarget = extractCoreMeaning(target);
  const targetOptions = coreTarget.split(/[,/|·]/).map(t => t.trim()).filter(Boolean);

  for (const targetOpt of targetOptions) {
    if (isTemplateText(targetOpt) || isTemplateText(userAnswer)) {
      if (checkTemplateMatch(userAnswer, targetOpt, isEnToKo)) return true;
      continue;
    }
    const cleanUser = cleanText(userAnswer);
    const cleanTarget = cleanText(targetOpt);
    if (!cleanUser || !cleanTarget) continue;

    if (!isEnToKo) {
      if (cleanUser === cleanTarget) return true;
    } else {
      if (cleanTarget === cleanUser) return true;
      const coreUser = stripVerbEnding(cleanUser);
      const coreTargetWord = stripVerbEnding(cleanTarget);
      if (coreTargetWord && coreTargetWord === coreUser) return true;
      if (coreTargetWord.length >= 2 && coreUser.length >= 2) {
        if (coreTargetWord.includes(coreUser) && coreUser.length >= coreTargetWord.length * 0.4) return true;
        if (coreUser.includes(coreTargetWord) && coreTargetWord.length >= coreUser.length * 0.4) return true;
      }
      const similarity = calcSimilarity(cleanUser, cleanTarget);
      const threshold = cleanTarget.length > 6 ? 0.55 : 0.70;
      if (similarity >= threshold) return true;
    }
  }
  return false;
};

// ============================================================
// 문제 텍스트 렌더링 (placeholder/부가설명 회색 처리)
// ============================================================
const PLACEHOLDER_REGEX = /\[[^\]]*\]|\{[^}]*\}|\bS\s*\+?\s*V\b|동사원형|주제명사|장소|계절|보충\s*설명|예시\s*및\s*추가\s*설명/g;

const splitByRegex = (text: string, regex: RegExp, keyPrefix: string): React.ReactNode[] => {
  const result: React.ReactNode[] = [];
  const r = new RegExp(regex.source, regex.flags);
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = r.exec(text)) !== null) {
    if (match.index > lastIdx) {
      result.push(<span key={`${keyPrefix}-t${i++}`}>{text.substring(lastIdx, match.index)}</span>);
    }
    result.push(
      <span key={`${keyPrefix}-g${i++}`} className="text-gray-300 font-light">{match[0]}</span>
    );
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    result.push(<span key={`${keyPrefix}-t${i++}`}>{text.substring(lastIdx)}</span>);
  }
  return result;
};

const renderQuestionText = (text: string, isTemplate: boolean): React.ReactNode => {
  if (!text) return null;
  if (!isTemplate) {
    return <>{splitByRegex(text, /\[[^\]]*\]|\{[^}]*\}/g, 'simple')}</>;
  }
  const parts = text.split(/(,\s*)/);
  let isInExtra = false;
  const segments: Array<{ text: string; grey: boolean }> = [];
  parts.forEach((part, idx) => {
    if (idx % 2 === 1) { segments.push({ text: part, grey: isInExtra }); return; }
    if (idx > 0 && isExtraContextPart(part)) isInExtra = true;
    segments.push({ text: part, grey: isInExtra });
  });
  const nodes: React.ReactNode[] = [];
  segments.forEach((seg, segIdx) => {
    if (seg.grey) {
      nodes.push(<span key={`g${segIdx}`} className="text-gray-300 font-light">{seg.text}</span>);
      return;
    }
    nodes.push(...splitByRegex(seg.text, PLACEHOLDER_REGEX, `seg${segIdx}`));
  });
  return <>{nodes}</>;
};

// ============================================================
// 단어 정렬 (LCS) + 글자 단위 비교
// ============================================================
interface AlignedItem {
  target?: string;
  user?: string;
  type: 'match' | 'wrong' | 'missing' | 'extra';
}

const normWord = (s: string) => s.toLowerCase().replace(/[^\w가-힣]/g, '');
const wordsAreEqual = (a: string, b: string): boolean => !!a && !!b && normWord(a) === normWord(b);
const wordsAreSimilar = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  const aN = normWord(a);
  const bN = normWord(b);
  if (!aN || !bN) return false;
  if (aN === bN) return true;
  return calcSimilarity(aN, bN) >= 0.55;
};

const alignWords = (target: string[], user: string[]): AlignedItem[] => {
  const n = target.length;
  const m = user.length;
  if (n === 0 && m === 0) return [];
  if (n === 0) return user.map(u => ({ user: u, type: 'extra' as const }));
  if (m === 0) return target.map(t => ({ target: t, type: 'missing' as const }));

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (wordsAreSimilar(target[i - 1], user[j - 1])) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  if (dp[n][m] === 0) {
    const result: AlignedItem[] = [];
    const maxLen = Math.max(n, m);
    for (let k = 0; k < maxLen; k++) {
      if (k < n && k < m) result.push({ target: target[k], user: user[k], type: 'wrong' });
      else if (k < n) result.push({ target: target[k], type: 'missing' });
      else result.push({ user: user[k], type: 'extra' });
    }
    return result;
  }

  const result: AlignedItem[] = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (wordsAreSimilar(target[i - 1], user[j - 1])) {
      const type: AlignedItem['type'] = wordsAreEqual(target[i - 1], user[j - 1]) ? 'match' : 'wrong';
      result.unshift({ target: target[i - 1], user: user[j - 1], type });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      result.unshift({ target: target[i - 1], type: 'missing' });
      i--;
    } else {
      result.unshift({ user: user[j - 1], type: 'extra' });
      j--;
    }
  }
  while (i > 0) { result.unshift({ target: target[i - 1], type: 'missing' }); i--; }
  while (j > 0) { result.unshift({ user: user[j - 1], type: 'extra' }); j--; }
  return result;
};

const renderCharDiff = (correctWord: string, userWord: string): React.ReactNode => {
  if (!userWord) return <span className="text-red-300 opacity-70">___</span>;
  const cLower = correctWord.toLowerCase();
  const uLower = userWord.toLowerCase();
  return (
    <>
      {userWord.split('').map((char, i) => {
        const cChar = cLower[i];
        const uChar = uLower[i];
        const isMatch = cChar !== undefined && cChar === uChar;
        return (
          <span
            key={i}
            className={isMatch ? '' : 'underline decoration-red-600 decoration-[3px] underline-offset-[3px] font-extrabold'}
          >
            {char}
          </span>
        );
      })}
      {cLower.length > uLower.length && (
        <span className="text-red-400 opacity-70 ml-0.5">
          {'·'.repeat(Math.min(cLower.length - uLower.length, 6))}
        </span>
      )}
    </>
  );
};

// ============================================================
// 비교 표시 컴포넌트
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
            <span key={i} className="font-mono inline-block min-w-[24px] text-center text-lg font-bold text-green-700 bg-green-50 border-b-[3px] border-green-400 pb-1 rounded-t-sm">
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
              <span key={i} className={`font-mono inline-block min-w-[24px] text-center text-lg font-bold pb-1 border-b-[3px] rounded-t-sm transition-all ${
                isMatch ? 'text-gray-700 bg-gray-50 border-gray-300' : 'text-red-600 bg-red-100 border-red-500'
              }`}>
                {display === ' ' ? '·' : display}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const TemplateSpellingDiff = ({ correct, user }: { correct: string; user: string }) => {
  const correctWords = correct.split(/\s+/).filter(Boolean);
  const userWords = user.split(/\s+/).filter(Boolean);
  const alignment = alignWords(correctWords, userWords);
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] text-green-700 font-bold tracking-widest uppercase mb-2 text-center">✓ 정답 (단어 순)</p>
        <div className="flex flex-wrap justify-center gap-1.5">
          {alignment.map((item, i) => {
            if (item.type === 'extra') {
              return <span key={i} aria-hidden className="opacity-0 select-none px-2.5 py-1 text-sm font-mono font-bold border border-transparent">{item.user}</span>;
            }
            return <span key={i} className="bg-green-50 text-green-800 px-2.5 py-1 rounded-md text-sm font-mono font-bold border border-green-300">{item.target}</span>;
          })}
        </div>
      </div>
      <div>
        <p className="text-[10px] text-red-600 font-bold tracking-widest uppercase mb-2 text-center">✗ 내가 적은 답 (틀린 글자 밑줄)</p>
        <div className="flex flex-wrap justify-center gap-1.5">
          {alignment.map((item, i) => {
            if (item.type === 'match') {
              return <span key={i} className="bg-gray-50 text-gray-700 border border-gray-200 px-2.5 py-1 rounded-md text-sm font-mono font-bold">{item.user}</span>;
            }
            if (item.type === 'missing') {
              return <span key={i} className="bg-yellow-50 text-yellow-700 border border-yellow-300 border-dashed px-2.5 py-1 rounded-md text-sm font-mono font-bold">___</span>;
            }
            if (item.type === 'wrong') {
              return (
                <span key={i} className="bg-red-100 text-red-700 border border-red-400 px-2.5 py-1 rounded-md text-sm font-mono font-bold">
                  {renderCharDiff(item.target || '', item.user || '')}
                </span>
              );
            }
            return (
              <span key={i} className="bg-red-100 text-red-700 border border-red-400 px-2.5 py-1 rounded-md text-sm font-mono font-bold line-through decoration-red-500 decoration-2">
                {item.user}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const KoreanAnswerDiff = ({ targets, user }: { targets: string[]; user: string }) => (
  <div className="space-y-3">
    <div>
      <p className="text-[10px] text-green-700 font-bold tracking-widest uppercase mb-2 text-center">✓ 정답 (모두 인정됨)</p>
      <div className="flex flex-wrap justify-center gap-2">
        {targets.map((t, i) => (
          <span key={i} className="bg-green-50 text-green-800 px-3 py-1.5 rounded-lg text-base font-bold border border-green-300">{t}</span>
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
  // ─── 추출/메인 ────────────────────────
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzingProgress, setAnalyzingProgress] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [extractMode, setExtractMode] = useState<'word' | 'phrase' | 'both'>('both');

  // ─── 저장/챕터 ────────────────────────
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null);

  // ─── 게임 진행 ────────────────────────
  const [activeWords, setActiveWords] = useState<Word[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [isEnToKo, setIsEnToKo] = useState(true);
  const [isFinished, setIsFinished] = useState(false);
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; target: string; word: Word; userAnswer: string } | null>(null);
  const [streak, setStreak] = useState(0);
  const [sessionTargetPoints, setSessionTargetPoints] = useState(0);
  const [initialSessionWordsCount, setInitialSessionWordsCount] = useState(0);

  // ─── 관리자 모드 ──────────────────────
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [newWord, setNewWord] = useState({ en: '', ko: '', pos: 'Noun', phonetics: '' });

  // ─── 선별 추가 (관리자 모드) ──────────
  const [bulkText, setBulkText] = useState('');
  const [bulkCandidates, setBulkCandidates] = useState<Word[]>([]);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkTargetChapter, setBulkTargetChapter] = useState<string>('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotalChunks, setBulkTotalChunks] = useState(0);

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
            id: w.id || newId(),
            score: Number(w.score) || 0,
            active: w.active !== false, // 미정의 → true
          })),
        }));
        setChapters(fixed);
      } catch {}
    }
  }, []);

  // ─── 저장소 헬퍼 ─────────────────────
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

  const toggleWordActive = (chapterId: string, wordId: string) => {
    saveChapters(
      chapters.map(ch =>
        ch.id === chapterId
          ? { ...ch, words: ch.words.map(w => w.id === wordId ? { ...w, active: !w.active } : w) }
          : ch
      )
    );
  };

  const setAllActive = (chapterId: string, active: boolean) => {
    saveChapters(
      chapters.map(ch =>
        ch.id === chapterId
          ? { ...ch, words: ch.words.map(w => ({ ...w, active })) }
          : ch
      )
    );
  };

  const getWordDict = (): WordDict => {
    try { return JSON.parse(localStorage.getItem(DICT_KEY) || '{}'); } catch { return {}; }
  };

  const enrichWithDictionary = (words: Word[]): Word[] => {
    const dict = getWordDict();
    const enriched = words.map(w => {
      const key = dictKey(w.en, w.pos);
      if (!key.trim() || key === '::') return w;
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
      }
      dict[key] = { ko: w.ko, pos: w.pos, phonetics: w.phonetics };
      return w;
    });
    localStorage.setItem(DICT_KEY, JSON.stringify(dict));
    return enriched;
  };

  const getFormattedDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  // ─── AI 분석 (공통 헬퍼) ──────────────
  const runAnalysis = async (
    rawText: string,
    mode: string,
    onProgress: (cur: number, total: number) => void
  ): Promise<Word[]> => {
    const lines = rawText.split('\n');
    const chunkSize = 40;
    const chunks: string[] = [];
    for (let i = 0; i < lines.length; i += chunkSize) {
      chunks.push(lines.slice(i, i + chunkSize).join('\n'));
    }
    onProgress(0, chunks.length);

    let allWords: Word[] = [];
    for (let i = 0; i < chunks.length; i++) {
      onProgress(i + 1, chunks.length);
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chunks[i], mode }),
      });
      if (!res.ok) throw new Error('서버 통신 실패');
      const rawData: Partial<Word>[] = await res.json();
      if (rawData?.length > 0) {
        const dataWithProps: Word[] = rawData.map(w => ({
          en: w.en || '',
          ko: w.ko || '',
          pos: w.pos || '',
          phonetics: w.phonetics || '',
          id: newId(),
          score: 0,
          active: w.active !== false,
        }));
        allWords = [...allWords, ...dataWithProps];
      }
    }

    const enriched = enrichWithDictionary(allWords);
    // en + pos 조합으로 중복 제거 (다품사 분리 보존)
    const seen = new Set<string>();
    return enriched.filter(w => {
      const k = dictKey(w.en, w.pos);
      if (!k.trim() || k === '::' || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  // ─── 메인 GENERATE ───────────────────
  const startAnalysis = async () => {
    if (!text.trim()) return alert('내용을 입력해주세요!');
    setLoading(true);
    try {
      const words = await runAnalysis(text, extractMode, (cur, total) => {
        setAnalyzingProgress(cur);
        setTotalChunks(total);
      });
      if (words.length > 0) {
        const newChapter: Chapter = {
          id: Date.now().toString(),
          date: getFormattedDate(),
          title: `${MODE_LABELS[extractMode]} 꾸러미`,
          words,
        };
        saveChapters([newChapter, ...chapters]);
        setText('');
        const activeCount = words.filter(w => w.active !== false).length;
        const inactiveCount = words.length - activeCount;
        alert(
          `총 ${words.length}개 항목 저장 완료!\n` +
          `· 추천 활성: ${activeCount}개\n` +
          `· 기초어로 비활성: ${inactiveCount}개\n` +
          `(챕터 설정에서 토글 가능)`
        );
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

  // ─── 선별 추가: 분석 ─────────────────
  const handleBulkAnalyze = async () => {
    if (!bulkText.trim()) return alert('단어를 입력해주세요!');
    setBulkLoading(true);
    try {
      const words = await runAnalysis(bulkText, extractMode, (cur, total) => {
        setBulkProgress(cur);
        setBulkTotalChunks(total);
      });
      setBulkCandidates(words);
      // 활성 추천된 단어만 기본 선택
      const initSelected = new Set(words.filter(w => w.active !== false).map(w => w.id));
      setBulkSelected(initSelected);
    } catch {
      alert('분석 중 오류가 발생했습니다.');
    } finally {
      setBulkLoading(false);
      setBulkProgress(0);
      setBulkTotalChunks(0);
    }
  };

  const toggleBulkSelect = (id: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllBulk = () => setBulkSelected(new Set(bulkCandidates.map(w => w.id)));
  const deselectAllBulk = () => setBulkSelected(new Set());

  const handleBulkAdd = () => {
    if (bulkSelected.size === 0) return alert('단어를 선택해주세요.');
    if (!bulkTargetChapter) return alert('추가할 챕터를 선택해주세요.');

    const selectedWords = bulkCandidates.filter(w => bulkSelected.has(w.id));

    if (bulkTargetChapter === '__new__') {
      const newChapter: Chapter = {
        id: Date.now().toString(),
        date: getFormattedDate(),
        title: `${MODE_LABELS[extractMode]} 꾸러미 (선별)`,
        words: selectedWords.map(w => ({ ...w, id: newId() })),
      };
      saveChapters([newChapter, ...chapters]);
      alert(`새 챕터에 ${selectedWords.length}개 단어 추가됨`);
    } else {
      const targetCh = chapters.find(c => c.id === bulkTargetChapter);
      if (!targetCh) return alert('챕터를 찾지 못했습니다.');
      // 중복 제거 (대상 챕터 내 동일 en+pos)
      const existingKeys = new Set(targetCh.words.map(w => dictKey(w.en, w.pos)));
      const fresh = selectedWords
        .filter(w => !existingKeys.has(dictKey(w.en, w.pos)))
        .map(w => ({ ...w, id: newId() }));
      const skipped = selectedWords.length - fresh.length;
      saveChapters(
        chapters.map(ch => ch.id === bulkTargetChapter ? { ...ch, words: [...ch.words, ...fresh] } : ch)
      );
      alert(
        `${fresh.length}개 추가됨` +
        (skipped > 0 ? `\n· ${skipped}개는 이미 존재해 제외` : '')
      );
    }

    setBulkText('');
    setBulkCandidates([]);
    setBulkSelected(new Set());
  };

  const cancelBulk = () => {
    setBulkCandidates([]);
    setBulkSelected(new Set());
  };

  // ─── 게임 ────────────────────────────
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
    const activeOnly = chapter.words.filter(w => w.active !== false);
    if (activeOnly.length === 0) return alert('활성화된 단어가 없습니다. 챕터 설정에서 활성화하세요.');
    let wordsToPlay = activeOnly.filter(w => (Number(w.score) || 0) < 2);
    if (wordsToPlay.length === 0) {
      if (confirm('🎉 이 챕터의 활성 단어를 모두 마스터했습니다! 점수를 초기화하고 다시 복습하시겠습니까?')) {
        const resetWords = chapter.words.map(w => w.active !== false ? { ...w, score: 0 } : w);
        const updated = chapters.map(ch => (ch.id === chapterId ? { ...ch, words: resetWords } : ch));
        saveChapters(updated);
        wordsToPlay = resetWords.filter(w => w.active !== false);
      } else return;
    }
    initializeGame(wordsToPlay, chapterId);
  };

  const playAllWords = () => {
    if (chapters.length === 0) return alert('저장된 항목이 없습니다.');
    const allWords = chapters.flatMap(ch => ch.words);
    const wordsToPlay = allWords.filter(w => w.active !== false && (Number(w.score) || 0) < 2);
    if (wordsToPlay.length === 0) return alert('활성 단어를 모두 마스터했거나 활성 단어가 없습니다.');
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
    if (!newWord.en || !newWord.ko) return alert('영어와 한국어는 필수입니다.');
    if (chapters.length === 0) return alert('먼저 챕터를 생성해주세요.');
    const updated = [...chapters];
    const enriched = enrichWithDictionary([
      { ...newWord, id: newId(), score: 0, active: true },
    ]);
    updated[0].words.push(enriched[0]);
    saveChapters(updated);
    setNewWord({ en: '', ko: '', pos: 'Noun', phonetics: '' });
    alert(`"${enriched[0].en}" 추가됨 → ${updated[0].title}`);
  };

  const deleteChapter = (id: string) => {
    if (confirm('정말 삭제하시겠습니까?')) saveChapters(chapters.filter(ch => ch.id !== id));
  };

  // ============================================================
  // 화면 1: 완료
  // ============================================================
  if (isFinished) {
    const completedChapter = activeChapterId ? chapters.find(c => c.id === activeChapterId) : null;
    const isAllMastered = completedChapter
      ? completedChapter.words.filter(w => w.active !== false).every(w => (Number(w.score) || 0) >= 2)
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
              ? `${completedChapter?.title}의 모든 활성 단어를 마스터했습니다 🎉`
              : '이번 세션의 항목들을 모두 처리했습니다.'}
          </p>
          <button onClick={quitGame} className="w-full bg-gray-900 text-white py-4 rounded-2xl font-light tracking-widest hover:bg-gray-800 transition-all">
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
    const coreAnswer = extractCoreMeaning(isEnToKo ? current.ko : current.en);
    const targetsList = coreAnswer.split(/[,/|·]/).map(t => t.trim()).filter(Boolean);
    const primaryTarget = targetsList[0] || (isEnToKo ? current.ko : current.en);
    const primaryWordCount = primaryTarget.trim().split(/\s+/).filter(Boolean).length;
    const useTemplateDiff = primaryWordCount >= 3;
    const showTemplateBadge = isTemplateText(questionText) || useTemplateDiff || isTemplatePos(current.pos);

    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#fafafa]">
        <div className="w-full max-w-md p-8 sm:p-10 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center relative min-h-[600px]">
          <button onClick={quitGame} className="absolute top-8 left-8 text-[10px] text-gray-400 uppercase tracking-widest transition-colors flex items-center gap-1">
            ← QUIT
          </button>
          <div className="absolute top-8 right-8 text-sm font-bold text-orange-500 transition-all">
            {streak >= 3 && `🔥 ${streak} Combo!`}
          </div>

          <div className="w-full mt-10 mb-6">
            <div className="flex justify-between items-end mb-2">
              <span className="text-[11px] text-gray-500 font-medium tracking-wide">
                진척도: <span className="text-gray-800">{pointsEarned} / {sessionTargetPoints} 완료</span>
              </span>
              <span className="text-sm font-bold text-gray-800 transition-all duration-300">{progress.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden relative shadow-inner mb-4">
              <div className="bg-gray-800 h-full transition-all duration-500 ease-out relative" style={{ width: `${progress}%` }}>
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

          <div className="flex w-full max-w-[200px] bg-gray-100 p-1 rounded-xl mb-4">
            <button onClick={() => { setIsEnToKo(true); setTimeout(() => inputRef.current?.focus(), 50); }}
              className={`flex-1 text-[10px] py-2 rounded-lg uppercase tracking-widest transition-all ${isEnToKo ? 'bg-white shadow-sm text-gray-800 font-bold' : 'text-gray-400'}`}>
              En → Ko
            </button>
            <button onClick={() => { setIsEnToKo(false); setTimeout(() => inputRef.current?.focus(), 50); }}
              className={`flex-1 text-[10px] py-2 rounded-lg uppercase tracking-widest transition-all ${!isEnToKo ? 'bg-white shadow-sm text-gray-800 font-bold' : 'text-gray-400'}`}>
              Ko → En
            </button>
          </div>

          <div className="h-[24px] mb-2 flex items-center justify-center gap-2">
            {showTemplateBadge && !feedback && (
              <span className="px-3 py-1 text-[10px] font-bold text-purple-600 bg-purple-50 rounded-full">📝 템플릿</span>
            )}
            {(Number(current.score) || 0) === 1 && !feedback && (
              <span className="px-3 py-1 text-[10px] font-bold text-blue-600 bg-blue-50 rounded-full">⭐ 1/2 마스터</span>
            )}
          </div>

          <h2 className={`font-normal mb-2 text-gray-800 text-center leading-snug break-words ${isTemplateText(questionText) ? 'text-lg px-2' : 'text-3xl'}`}>
            {renderQuestionText(questionText, isTemplateText(questionText))}
          </h2>
          <p className="text-gray-400 text-sm font-light mb-8">
            {current.phonetics}
            <span className="text-[10px] ml-1 opacity-50 border border-gray-200 px-1.5 py-0.5 rounded-full">[{current.pos}]</span>
          </p>

          {feedback ? (
            <div className={`w-full p-6 rounded-2xl text-center ${feedback.isCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
              <p className={`text-sm mb-4 font-bold tracking-widest ${feedback.isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                {feedback.isCorrect ? '✓ CORRECT!' : '✗ INCORRECT'}
              </p>
              {feedback.isCorrect ? (
                <p className={`text-gray-900 font-bold mb-2 break-words ${isTemplateText(feedback.target) ? 'text-base leading-relaxed' : 'text-xl'}`}>
                  {renderQuestionText(feedback.target, isTemplateText(feedback.target))}
                </p>
              ) : (
                <div className="mb-6">
                  {isEnToKo ? (
                    <KoreanAnswerDiff targets={targetsList} user={feedback.userAnswer} />
                  ) : useTemplateDiff ? (
                    <TemplateSpellingDiff correct={primaryTarget} user={feedback.userAnswer} />
                  ) : (
                    <EnglishSpellingDiff correct={primaryTarget} user={feedback.userAnswer} />
                  )}
                </div>
              )}
              {!feedback.isCorrect && (
                <div className="flex gap-2">
                  <button ref={retryBtnRef} onClick={handleRetry}
                    className="flex-1 bg-gray-900 text-white py-3 rounded-xl text-xs font-light hover:bg-gray-800 focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 transition-all outline-none">
                    다시하기 (Enter)
                  </button>
                  <button onClick={handleForceCorrect}
                    className="flex-1 bg-white border border-gray-200 text-gray-600 py-3 rounded-xl text-xs font-light hover:bg-gray-50 focus:ring-2 focus:ring-gray-200 transition-all outline-none">
                    내 답이 맞음 (통과)
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full flex flex-col items-center mt-auto">
              <textarea ref={inputRef} rows={useTemplateDiff ? 3 : 1}
                className={`w-full px-4 py-3 border-b border-gray-100 bg-transparent mb-4 text-center font-light focus:border-gray-800 outline-none transition-colors resize-none overflow-hidden ${useTemplateDiff ? 'text-base leading-relaxed' : 'text-xl'}`}
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCheck(); } }}
                placeholder={useTemplateDiff ? (isEnToKo ? '한국어 의미 입력 (단어 위주 평가)' : '영어 템플릿 입력 (Shift+Enter 줄바꿈)') : (isEnToKo ? '한국어 뜻 입력' : '영어 스펠링 정확히 입력')}
                autoFocus spellCheck="false" />
              <p className="text-[11px] text-blue-600 mb-6 font-medium tracking-wide bg-blue-50 px-4 py-1.5 rounded-full">
                목표 달성까지 남은 정답 횟수: <span className="font-bold text-blue-700">{displayRemainingHits}번</span>
              </p>
              <button onClick={handleCheck}
                className="w-full bg-gray-900 text-white py-4 rounded-2xl font-light tracking-widest hover:bg-gray-800 transition-all">
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
            <button onClick={() => setIsAdminMode(!isAdminMode)}
              className={`text-[10px] px-3 py-1.5 border rounded-md transition-colors font-light tracking-wide ${isAdminMode ? 'bg-gray-800 text-white border-gray-800' : 'text-gray-400 border-gray-200 hover:text-gray-600'}`}>
              {isAdminMode ? '보관함으로 가기' : '관리자 추가 모드'}
            </button>
            <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
              {(['word', 'phrase', 'both'] as const).map(m => (
                <button key={m} onClick={() => setExtractMode(m)}
                  className={`px-4 py-2 text-[11px] rounded-lg tracking-wide transition-all ${extractMode === m ? 'bg-white shadow-sm text-gray-800 font-bold' : 'text-gray-400'}`}>
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={`mb-6 px-4 py-2.5 rounded-xl border text-[11px] font-medium tracking-wide ${
          extractMode === 'phrase' ? 'bg-purple-50 border-purple-200 text-purple-700' :
          extractMode === 'word' ? 'bg-blue-50 border-blue-200 text-blue-700' :
          'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          {extractMode === 'phrase' && '📝 문장 모드: 템플릿 문장을 통째로 추출합니다.'}
          {extractMode === 'word' && '🔤 단어 모드: 단어 단위로 추출하고 동의어를 보강합니다.'}
          {extractMode === 'both' && '🎯 복합 모드: 단어와 템플릿 문장을 동시에 추출합니다.'}
        </div>

        {/* ────────────────── 관리자 모드 ────────────────── */}
        {isAdminMode && (
          <div className="space-y-6 mb-10">
            {/* 1. 수동 한 단어 추가 */}
            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-1 tracking-wide">📝 한 단어씩 수동 추가</h3>
              <p className="text-[11px] text-gray-400 mb-4">맨 위 챕터에 추가됩니다.</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <input placeholder="영어 (필수)" value={newWord.en} onChange={e => setNewWord({ ...newWord, en: e.target.value })} className="p-3 rounded-xl border border-gray-200 bg-white text-sm font-light outline-none focus:border-gray-400" />
                <input placeholder="한국어 뜻 (필수, 콤마로 여러개)" value={newWord.ko} onChange={e => setNewWord({ ...newWord, ko: e.target.value })} className="p-3 rounded-xl border border-gray-200 bg-white text-sm font-light outline-none focus:border-gray-400" />
                <input placeholder="유형 (예: Noun, Verb, Expression)" value={newWord.pos} onChange={e => setNewWord({ ...newWord, pos: e.target.value })} className="p-3 rounded-xl border border-gray-200 bg-white text-sm font-light outline-none focus:border-gray-400" />
                <input placeholder="발음 기호" value={newWord.phonetics} onChange={e => setNewWord({ ...newWord, phonetics: e.target.value })} className="p-3 rounded-xl border border-gray-200 bg-white text-sm font-light outline-none focus:border-gray-400" />
              </div>
              <button onClick={handleAddWord} className="w-full bg-gray-700 text-white py-3 rounded-xl text-sm font-light tracking-wide hover:bg-gray-800 transition-colors">
                추가하기
              </button>
            </div>

            {/* 2. 선별 추가 (여러 단어 분석 후 골라담기) */}
            <div className="p-6 bg-blue-50 rounded-2xl border border-blue-200">
              <h3 className="text-sm font-medium text-blue-800 mb-1 tracking-wide">📋 여러 단어 분석해서 골라담기</h3>
              <p className="text-[11px] text-blue-500 mb-4">텍스트를 분석한 뒤 카드에서 원하는 항목만 클릭해 추가합니다.</p>

              <div className="mb-3">
                <label className="text-[11px] text-gray-600 block mb-1.5">추가할 챕터</label>
                <select value={bulkTargetChapter} onChange={e => setBulkTargetChapter(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-blue-400">
                  <option value="">— 챕터를 선택하세요 —</option>
                  <option value="__new__">＋ 새 챕터로 만들기</option>
                  {chapters.map(c => (
                    <option key={c.id} value={c.id}>{c.title} ({c.words.length}개)</option>
                  ))}
                </select>
              </div>

              <textarea
                className="w-full h-32 p-4 bg-white border border-gray-200 rounded-xl mb-3 outline-none resize-none text-sm font-light text-gray-700 leading-relaxed focus:border-blue-400"
                placeholder="여러 단어나 문장을 한꺼번에 붙여넣으세요..."
                value={bulkText} onChange={e => setBulkText(e.target.value)} />

              <button onClick={handleBulkAnalyze} disabled={bulkLoading || !bulkText.trim()}
                className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 transition-colors mb-4">
                {bulkLoading ? (bulkTotalChunks > 0 ? `분석 중... (${bulkProgress}/${bulkTotalChunks})` : '분석 중...') : '분석하기'}
              </button>

              {bulkCandidates.length > 0 && (
                <div className="bg-white p-4 rounded-xl border border-gray-200">
                  <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                    <p className="text-xs font-medium text-gray-700">
                      <span className="text-blue-600 font-bold">{bulkSelected.size}</span>개 선택됨 / 전체 {bulkCandidates.length}개
                    </p>
                    <div className="flex gap-2">
                      <button onClick={selectAllBulk} className="text-[10px] px-2 py-1 bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100">전체선택</button>
                      <button onClick={deselectAllBulk} className="text-[10px] px-2 py-1 bg-gray-50 text-gray-600 rounded border border-gray-200 hover:bg-gray-100">모두해제</button>
                      <button onClick={cancelBulk} className="text-[10px] px-2 py-1 bg-red-50 text-red-600 rounded border border-red-200 hover:bg-red-100">취소</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto mb-4 pr-1">
                    {bulkCandidates.map(w => {
                      const selected = bulkSelected.has(w.id);
                      const isTpl = isTemplatePos(w.pos);
                      return (
                        <button key={w.id} onClick={() => toggleBulkSelect(w.id)}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            selected ? 'bg-blue-100 border-blue-400 shadow-sm' : 'bg-gray-50 border-gray-200 opacity-60 hover:opacity-90'
                          }`}>
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className={`text-sm font-bold break-words ${isTpl ? 'text-purple-800' : 'text-gray-900'}`}>
                              {w.en}
                            </span>
                            <div className="flex gap-1 shrink-0">
                              {w.pos && (
                                <span className="text-[9px] text-gray-500 border border-gray-200 px-1 py-0.5 rounded">{w.pos}</span>
                              )}
                              {selected && <span className="text-[10px] text-blue-600 font-bold">✓</span>}
                            </div>
                          </div>
                          <div className="text-xs text-gray-600 break-words">{w.ko}</div>
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={handleBulkAdd} disabled={bulkSelected.size === 0 || !bulkTargetChapter}
                    className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                    선택한 {bulkSelected.size}개 추가하기
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ────────────────── 메인 GENERATE ────────────────── */}
        {!isAdminMode && (
          <>
            <textarea
              className="w-full h-56 p-6 bg-gray-50 border border-gray-100 rounded-2xl mb-6 focus:border-gray-300 outline-none resize-none text-gray-700 font-light leading-relaxed"
              placeholder="여기에 공부한 내용을 냅다 꽂아주세요..."
              value={text} onChange={e => setText(e.target.value)} />
            <button onClick={startAnalysis} disabled={loading}
              className="w-full bg-gray-900 text-white py-5 rounded-2xl font-light tracking-[0.2em] hover:bg-gray-800 disabled:bg-gray-400 transition-all mb-16">
              {loading ? (totalChunks > 0 ? `쪼개서 분석 중... (${analyzingProgress}/${totalChunks})` : '단어장 생성 중...') : 'GENERATE CHAPTER'}
            </button>
          </>
        )}

        {/* ────────────────── 보관함 ────────────────── */}
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
              const activeWordsCh = ch.words.filter(w => w.active !== false);
              const inactiveCount = ch.words.length - activeWordsCh.length;
              const masteredCount = activeWordsCh.filter(w => (Number(w.score) || 0) >= 2).length;
              const totalActive = activeWordsCh.length;
              const isPerfect = totalActive > 0 && masteredCount === totalActive;
              const masteryPct = totalActive > 0 ? (masteredCount / totalActive) * 100 : 0;
              const isExpanded = expandedChapterId === ch.id;

              return (
                <div key={ch.id} className={`group p-5 border rounded-2xl transition-all relative overflow-hidden ${
                  isPerfect ? 'bg-gradient-to-br from-yellow-50 via-amber-50 to-blue-50 border-amber-400 shadow-md' : 'bg-white border-gray-100 hover:border-gray-300'
                }`}>
                  {isPerfect && <div className="absolute top-2 right-2 text-2xl animate-pulse pointer-events-none">🏆</div>}
                  <div className="flex justify-between items-start">
                    <div className="flex-1 mr-4 min-w-0">
                      <p className={`text-[10px] font-medium mb-1 ${isPerfect ? 'text-amber-600' : 'text-gray-300'}`}>{ch.date}</p>
                      {editingChapterId === ch.id ? (
                        <div className="flex gap-2 mt-1">
                          <input
                            className="flex-1 border-b border-gray-800 outline-none text-sm font-light py-1 bg-transparent"
                            value={editTitle} onChange={e => setEditTitle(e.target.value)} autoFocus
                            onKeyDown={e => e.key === 'Enter' && handleRename(ch.id)} />
                          <button onClick={() => handleRename(ch.id)} className="text-[10px] text-blue-500 font-bold">SAVE</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <h3 className={`text-sm font-medium ${isPerfect ? 'text-amber-900' : 'text-gray-800'}`}>{ch.title}</h3>
                          <button onClick={() => { setEditingChapterId(ch.id); setEditTitle(ch.title); }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded bg-white">
                            EDIT
                          </button>
                        </div>
                      )}
                      <p className={`text-[11px] font-medium mt-2 tracking-tighter ${isPerfect ? 'text-amber-700' : 'text-gray-500'}`}>
                        {isPerfect ? '🎉 100% 마스터 완료' : `${masteredCount} / ${totalActive} 마스터 (${masteryPct.toFixed(0)}%)`}
                        {inactiveCount > 0 && (
                          <span className="ml-2 text-gray-400">+{inactiveCount} 비활성</span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-1 z-10 shrink-0">
                      <button onClick={() => playChapter(ch.id)}
                        className={`px-4 py-2 text-[10px] font-bold rounded-lg transition-colors border shadow-sm ${
                          isPerfect ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200' : 'bg-gray-50 text-gray-800 border-gray-100 hover:bg-gray-100'
                        }`}>
                        {isPerfect ? '초기화 후 다시' : 'PLAY'}
                      </button>
                      <button onClick={() => setExpandedChapterId(isExpanded ? null : ch.id)}
                        title="단어 활성/비활성 설정"
                        className={`p-2 rounded-lg transition-colors border ${
                          isExpanded ? 'bg-blue-50 text-blue-600 border-blue-200' : 'text-gray-400 hover:text-gray-700 border-transparent'
                        }`}>
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                      <button onClick={() => deleteChapter(ch.id)}
                        className="p-2 text-red-200 hover:text-red-500 transition-colors">
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* ─── 챕터 확장: 단어 활성/비활성 ─── */}
                  {isExpanded && (
                    <div className="mt-5 pt-5 border-t border-gray-100">
                      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                        <p className="text-[11px] font-medium text-gray-600">
                          활성 <span className="font-bold text-green-600">{totalActive}</span> · 
                          비활성 <span className="font-bold text-gray-400">{inactiveCount}</span>
                          <span className="text-gray-400 ml-1">(클릭하여 토글)</span>
                        </p>
                        <div className="flex gap-2">
                          <button onClick={() => setAllActive(ch.id, true)}
                            className="text-[10px] px-2 py-1 bg-green-50 text-green-700 rounded border border-green-200 hover:bg-green-100">
                            전체 활성
                          </button>
                          <button onClick={() => setAllActive(ch.id, false)}
                            className="text-[10px] px-2 py-1 bg-gray-50 text-gray-600 rounded border border-gray-200 hover:bg-gray-100">
                            전체 비활성
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto pr-1">
                        {ch.words.map(w => {
                          const wActive = w.active !== false;
                          const wScore = Number(w.score) || 0;
                          const isTpl = isTemplatePos(w.pos);
                          return (
                            <button key={w.id} onClick={() => toggleWordActive(ch.id, w.id)}
                              className={`p-3 rounded-lg border text-left transition-all ${
                                wActive
                                  ? 'bg-green-50 border-green-200 hover:border-green-400'
                                  : 'bg-gray-50 border-gray-200 opacity-50 hover:opacity-80'
                              }`}>
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <span className={`text-sm font-bold break-words ${isTpl ? 'text-purple-800' : 'text-gray-900'}`}>
                                  {w.en}
                                </span>
                                {w.pos && (
                                  <span className="text-[9px] text-gray-500 border border-gray-200 px-1 py-0.5 rounded shrink-0">{w.pos}</span>
                                )}
                              </div>
                              <div className="text-xs text-gray-600 break-words">{w.ko}</div>
                              <div className="flex items-center justify-between mt-1.5">
                                <span className={`text-[9px] font-bold ${wActive ? 'text-green-600' : 'text-gray-400'}`}>
                                  {wActive ? '● 활성' : '○ 비활성'}
                                </span>
                                {wScore > 0 && (
                                  <span className="text-[9px] text-blue-500">
                                    {wScore === 2 ? '✓ 마스터' : '· 1/2'}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
