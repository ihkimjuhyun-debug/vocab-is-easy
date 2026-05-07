'use client';
import { useState, useEffect, useRef } from 'react';

interface Word {
  id: string;      
  en: string; 
  ko: string; 
  pos: string; 
  phonetics: string;
  score: number;   
}

interface Chapter {
  id: string; 
  date: string; 
  title: string; 
  words: Word[];
}

const calculateSimilarity = (s1: string, s2: string): number => {
  let longer = s1; let shorter = s2;
  if (s1.length < s2.length) { longer = s2; shorter = s1; }
  let longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  let costs = [];
  for (let i = 0; i <= longer.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) costs[j] = j;
      else {
        if (j > 0) {
          let newValue = costs[j - 1];
          if (longer.charAt(i - 1) !== shorter.charAt(j - 1))
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          costs[j - 1] = lastValue; lastValue = newValue;
        }
      }
    }
    if (i > 0) costs[shorter.length] = lastValue;
  }
  return (longerLength - costs[shorter.length]) / longerLength;
};

export default function AIWordMaster() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzingProgress, setAnalyzingProgress] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  
  const [extractMode, setExtractMode] = useState<'word' | 'phrase' | 'both'>('both');
  
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeWords, setActiveWords] = useState<Word[]>([]);
  const [answer, setAnswer] = useState('');
  const [isEnToKo, setIsEnToKo] = useState(true);
  const [totalWordsCount, setTotalWordsCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; target: string; word: Word; userAnswer: string } | null>(null);
  const [streak, setStreak] = useState(0);
  
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [newWord, setNewWord] = useState({ en: '', ko: '', pos: 'Noun', phonetics: '' });

  const inputRef = useRef<HTMLInputElement>(null);
  const retryBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (feedback && !feedback.isCorrect) {
      setTimeout(() => retryBtnRef.current?.focus(), 50);
    }
  }, [feedback]);

  useEffect(() => {
    const savedData = localStorage.getItem('my_word_storage_v7');
    if (savedData) {
      let parsed: Chapter[] = JSON.parse(savedData);
      parsed = parsed.map(ch => ({
        ...ch,
        words: ch.words.map(w => ({
          ...w,
          id: w.id || Date.now().toString() + Math.random().toString(36).substring(2),
          score: Number(w.score) || 0 
        }))
      }));
      setChapters(parsed);
      localStorage.setItem('my_word_storage_v7', JSON.stringify(parsed));
    }
  }, []);

  const saveToStorage = (newChapters: Chapter[]) => {
    setChapters(newChapters);
    localStorage.setItem('my_word_storage_v7', JSON.stringify(newChapters));
  };

  const updateWordScoreInStorage = (wordId: string, newScore: number) => {
    setChapters(prev => {
      const updated = prev.map(ch => ({
        ...ch,
        words: ch.words.map(w => w.id === wordId ? { ...w, score: newScore } : w)
      }));
      localStorage.setItem('my_word_storage_v7', JSON.stringify(updated));
      return updated;
    });
  };

  const getFormattedDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  };

  const startAIAnalysis = async () => {
    if (!text.trim()) return alert('내용을 입력해주세요!');
    setLoading(true);
    setAnalyzingProgress(0);
    
    try {
      const lines = text.split('\n');
      const chunkSize = 40; 
      const chunks = [];
      for (let i = 0; i < lines.length; i += chunkSize) {
        chunks.push(lines.slice(i, i + chunkSize).join('\n'));
      }
      
      setTotalChunks(chunks.length);
      let allExtractedWords: Word[] = [];

      for (let i = 0; i < chunks.length; i++) {
        setAnalyzingProgress(i + 1);
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: chunks[i], mode: extractMode }),
        });
        
        if (!res.ok) throw new Error('서버 통신 실패');
        
        const rawData: Partial<Word>[] = await res.json();
        if (rawData && rawData.length > 0) {
          const dataWithProps = rawData.map(w => ({
            en: w.en || '', ko: w.ko || '', pos: w.pos || '', phonetics: w.phonetics || '',
            id: Date.now().toString() + Math.random().toString(36).substring(2),
            score: 0
          }));
          allExtractedWords = [...allExtractedWords, ...dataWithProps];
        }
      }

      if (allExtractedWords.length > 0) {
        const dateStr = getFormattedDate();
        const newChapter:
