'use client';
import { useState, useEffect, useRef } from 'react';

interface Word {
  en: string; ko: string; pos: string; phonetics: string;
}

interface Chapter {
  id: string;
  date: string;     // 타임스탬프 보존용
  title: string;    // 수정 가능한 제목
  words: Word[];
}

// 유사도 알고리즘 (이전 로직 유지)
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
  const [extractMode, setExtractMode] = useState<'word' | 'phrase' | 'both'>('phrase');
  
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeWords, setActiveWords] = useState<Word[]>([]);
  const [answer, setAnswer] = useState('');
  const [isEnToKo, setIsEnToKo] = useState(true);
  const [totalWordsCount, setTotalWordsCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; target: string; word: Word } | null>(null);
  
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedData = localStorage.getItem('my_word_storage_v2');
    if (savedData) setChapters(JSON.parse(savedData));
  }, []);

  const saveToStorage = (newChapters: Chapter[]) => {
    setChapters(newChapters);
    localStorage.setItem('my_word_storage_v2', JSON.stringify(newChapters));
  };

  const getFormattedDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  };

  const startAIAnalysis = async () => {
    if (!text.trim()) return alert('내용을 입력해주세요!');
    setLoading(true);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, mode: extractMode }),
      });
      const data: Word[] = await res.json();
      if (data && data.length > 0) {
        const dateStr = getFormattedDate();
        const newChapter: Chapter = {
          id: Date.now().toString(),
          date: dateStr,
          title: `${extractMode === 'phrase' ? '표현' : extractMode === 'word' ? '단어' : '복합'} 꾸러미`,
          words: data
        };
        saveToStorage([newChapter, ...chapters]);
        setText('');
        alert(`${data.length}개의 항목이 저장되었습니다!`);
      }
    } catch (e) { alert('분석 실패'); }
    finally { setLoading(false); }
  };

  const handleRename = (id: string) => {
    const updated = chapters.map(ch => ch.id === id ? { ...ch, title: editTitle } : ch);
    saveToStorage(updated);
    setEditingChapterId(null);
  };

  // 학습 로직 (기존 정밀 채점 로직 유지)
  const handleCheck = () => {
    if (activeWords.length === 0 || !answer.trim()) return;
    const current = activeWords[0];
    const target = isEnToKo ? current.ko : current.en;
    const cleanUser = answer.replace(/[^가-힣a-zA-Z0-9]/g, '').toLowerCase();
    const targetOptions = target.split(',').map(t => t.replace(/[^가-힣a-zA-Z0-9]/g, '').toLowerCase());

    let isCorrect = false;
    for (const cleanTarget of targetOptions) {
      const similarity = calculateSimilarity(cleanUser, cleanTarget);
      const threshold = cleanTarget.length > 8 ? 0.55 : 0.75;
      if (cleanTarget.includes(cleanUser) && cleanUser.length >= cleanTarget.length * 0.5 || similarity >= threshold) {
        isCorrect = true; break;
      }
    }
    setFeedback({ isCorrect, target, word: current });
    if (isCorrect) setTimeout(() => handleNext(false, true), 800);
  };

  const handleNext = (forceCorrect: boolean, autoCorrect = false) => {
    if (feedback?.isCorrect || forceCorrect) {
      const remaining = activeWords.slice(1);
      setActiveWords(remaining);
      if (remaining.length === 0) setIsFinished(true);
    } else {
      setActiveWords((prev) => [...prev.slice(1), prev[0]]);
    }
    setFeedback(null); setAnswer('');
    if (!autoCorrect) setTimeout(() => inputRef.current?.focus(), 100);
  };

  // --- UI Render ---
  if (isFinished) return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#fafafa]">
      <div className="w-full max-w-md p-10 bg-white rounded-3xl shadow-sm border border-gray-100 text-center">
        <div className="text-6xl mb-6">🏆</div>
        <h2 className="text-2xl font-light mb-10 text-gray-800">모든 학습을 완료했습니다!</h2>
        <button onClick={() => {setIsFinished(false); setActiveWords([]);}} className="w-full bg-gray-900 text-white py-4 rounded-2xl font-light tracking-widest">보관함으로 가기</button>
      </div>
    </div>
  );

  if (activeWords.length > 0) {
    const current = activeWords[0];
    const progress = ((totalWordsCount - activeWords.length) / totalWordsCount) * 100;
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#fafafa]">
        <div className="w-full max-w-md p-10 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center relative min-h-[550px]">
          <button onClick={() => setActiveWords([])} className="absolute top-8 left-8 text-[10px] text-gray-400 uppercase tracking-widest transition-colors flex items-center gap-1">← QUIT</button>
          <div className="w-full mt-10 mb-12">
            <div className="w-full bg-gray-100 h-1 rounded-full overflow-hidden">
              <div className="bg-gray-800 h-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
          <p className="text-[10px] font-medium tracking-widest text-gray-400 mb-4 uppercase">{isEnToKo ? "English to Korean" : "Korean to English"}</p>
          <h2 className="text-3xl font-normal mb-2 text-gray-800 text-center leading-snug">{isEnToKo ? current.en : current.ko}</h2>
          <p className="text-gray-400 text-sm font-light mb-12">{current.phonetics} <span className="text-[10px] ml-1 opacity-50">[{current.pos}]</span></p>

          {feedback ? (
            <div className={`w-full p-6 rounded-2xl text-center ${feedback.isCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
              <p className={`text-sm mb-2 ${feedback.isCorrect ? 'text-green-600' : 'text-red-600'}`}>{feedback.isCorrect ? 'Correct!' : 'Incorrect'}</p>
              <p className="text-gray-800 font-medium mb-6">{feedback.target}</p>
              {!feedback.isCorrect && (
                <div className="flex gap-2">
                  <button onClick={() => handleNext(false)} className="flex-1 bg-gray-900 text-white py-3 rounded-xl text-xs font-light">다시하기</button>
                  <button onClick={() => handleNext(true)} className="flex-1 bg-white border border-gray-200 text-gray-600 py-3 rounded-xl text-xs font-light">내 답이 맞음</button>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full flex flex-col items-center">
              <input ref={inputRef} className="w-full p-4 border-b border-gray-100 bg-transparent mb-10 text-center text-xl font-light focus:border-gray-800 outline-none transition-colors" value={answer} onChange={(e)=>setAnswer(e.target.value)} onKeyDown={(e)=>e.key==='Enter'&&handleCheck()} placeholder="정답 입력" autoFocus spellCheck="false" />
              <button onClick={handleCheck} className="w-full bg-gray-900 text-white py-4 rounded-2xl font-light tracking-widest hover:bg-gray-800 transition-all">CHECK</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-screen p-6 bg-[#fafafa] pt-16">
      <div className="w-full max-w-2xl bg-white p-10 rounded-[2rem] shadow-sm border border-gray-100">
        <div className="flex justify-between items-start mb-10">
          <div>
            <h1 className="text-2xl font-normal text-gray-800 tracking-tight">AI Word Master</h1>
            <p className="text-gray-400 mt-1 font-light text-sm">추출 모드를 선택하고 노트를 붙여넣으세요.</p>
          </div>
          <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
            {(['word', 'phrase', 'both'] as const).map(m => (
              <button key={m} onClick={()=>setExtractMode(m)} className={`px-4 py-2 text-[10px] rounded-lg uppercase tracking-widest transition-all ${extractMode === m ? 'bg-white shadow-sm text-gray-800 font-bold' : 'text-gray-400'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>

        <textarea className="w-full h-56 p-6 bg-gray-50 border border-gray-100 rounded-2xl mb-6 focus:border-gray-300 outline-none resize-none text-gray-700 font-light leading-relaxed" placeholder="여기에 공부한 내용을 붙여넣으세요..." value={text} onChange={(e)=>setText(e.target.value)} />
        <button onClick={startAIAnalysis} disabled={loading} className="w-full bg-gray-900 text-white py-5 rounded-2xl font-light tracking-[0.2em] hover:bg-gray-800 disabled:bg-gray-100 transition-all mb-16">
          {loading ? "ANALYZING..." : "GENERATE CHAPTER"}
        </button>

        <div className="border-t border-gray-50 pt-10">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-lg font-normal text-gray-800">Storage</h2>
            {chapters.length > 0 && <button onClick={playAllWords} className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">Play All Words</button>}
          </div>

          <div className="space-y-4">
            {chapters.map((ch) => (
              <div key={ch.id} className="group p-5 bg-white border border-gray-100 rounded-2xl hover:border-gray-300 transition-all">
                <div className="flex justify-between items-start">
                  <div className="flex-1 mr-4">
                    <p className="text-[10px] text-gray-300 font-medium mb-1">{ch.date}</p>
                    {editingChapterId === ch.id ? (
                      <div className="flex gap-2">
                        <input className="flex-1 border-b border-gray-800 outline-none text-sm font-light py-1" value={editTitle} onChange={(e)=>setEditTitle(e.target.value)} autoFocus onKeyDown={(e)=>e.key==='Enter'&&handleRename(ch.id)} />
                        <button onClick={()=>handleRename(ch.id)} className="text-[10px] text-blue-500 font-bold">SAVE</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-gray-800">{ch.title}</h3>
                        <button onClick={()=>{setEditingChapterId(ch.id); setEditTitle(ch.title);}} className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-gray-400">EDIT</button>
                      </div>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-tighter">{ch.words.length} items</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={()=>{playChapter(ch.words); setTotalWordsCount(ch.words.length);}} className="px-4 py-2 bg-gray-50 text-gray-800 text-[10px] font-bold rounded-lg hover:bg-gray-100">PLAY</button>
                    <button onClick={()=>{if(confirm('Delete?')){saveToStorage(chapters.filter(c=>c.id!==ch.id))}}} className="p-2 text-red-200 hover:text-red-500 transition-colors">
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
