'use client';
import { useState, useEffect, useRef } from 'react';

interface Word {
  en: string; ko: string; pos: string; phonetics: string;
}

interface Chapter {
  id: string;
  date: string;
  title: string;
  words: Word[];
}

// 유사도 알고리즘
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
  const [newWord, setNewWord] = useState({ en: '', ko: '', pos: 'Phrase', phonetics: '' });

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
    } catch (e) { alert('분석 중 오류가 발생했습니다.'); }
    finally { setLoading(false); }
  };

  const handleRename = (id: string) => {
    const updated = chapters.map(ch => ch.id === id ? { ...ch, title: editTitle } : ch);
    saveToStorage(updated);
    setEditingChapterId(null);
  };

  const handleAddWord = () => {
    if (!newWord.en || !newWord.ko) return alert('영어와 한국어 뜻은 필수입니다.');
    if (chapters.length === 0) return alert('먼저 AI 추출을 통해 챕터를 생성해주세요.');
    const updatedChapters = [...chapters];
    updatedChapters[0].words.push(newWord); 
    saveToStorage(updatedChapters);
    setNewWord({ en: '', ko: '', pos: 'Phrase', phonetics: '' });
    alert('수동으로 추가되었습니다.');
  };

  // 💡 스마트 채점 로직
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

  // 🛠️ 실수로 누락되었던 필수 실행 함수들 완벽 복구
  const playChapter = (chapterWords: Word[]) => {
    if (chapterWords.length === 0) return alert('단어가 없습니다.');
    const shuffled = [...chapterWords].sort(() => Math.random() - 0.5);
    setActiveWords(shuffled);
    setTotalWordsCount(shuffled.length);
    setIsFinished(false);
  };

  const playAllWords = () => {
    if (chapters.length === 0) return alert('저장된 단어가 없습니다.');
    const allWords = chapters.flatMap(ch => ch.words);
    const shuffled = [...allWords].sort(() => Math.random() - 0.5);
    setActiveWords(shuffled);
    setTotalWordsCount(shuffled.length);
    setIsFinished(false);
  };

  const deleteChapter = (id: string) => {
    if (confirm('이 단어장 챕터를 정말 삭제하시겠습니까?')) {
      const filtered = chapters.filter(ch => ch.id !== id);
      saveToStorage(filtered);
    }
  };

  const quitGame = () => {
    setActiveWords([]);
    setTotalWordsCount(0);
    setIsFinished(false);
    setFeedback(null);
  };

  // --- UI Render ---

  if (isFinished) return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#fafafa]">
      <div className="w-full max-w-md p-10 bg-white rounded-3xl shadow-sm border border-gray-100 text-center">
        <div className="text-6xl mb-6">🏆</div>
        <h2 className="text-2xl font-light mb-10 text-gray-800">모든 학습을 완료했습니다!</h2>
        <button onClick={quitGame} className="w-full bg-gray-900 text-white py-4 rounded-2xl font-light tracking-widest">보관함으로 가기</button>
      </div>
    </div>
  );

  if (activeWords.length > 0 && !isAdminMode) {
    const current = activeWords[0];
    const progress = ((totalWordsCount - activeWords.length) / totalWordsCount) * 100;
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#fafafa]">
        <div className="w-full max-w-md p-10 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center relative min-h-[550px]">
          <button onClick={quitGame} className="absolute top-8 left-8 text-[10px] text-gray-400 uppercase tracking-widest transition-colors flex items-center gap-1">← QUIT</button>
          
          <div className="w-full mt-10 mb-12">
            <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
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
              <button onClick={() => setIsEnToKo(!isEnToKo)} className="mt-6 text-gray-400 text-xs font-light hover:text-gray-600 transition-colors">모드 전환</button>
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
          <div className="flex flex-col items-end gap-3">
            <button onClick={() => setIsAdminMode(!isAdminMode)} className={`text-[10px] px-3 py-1.5 border rounded-md transition-colors font-light tracking-wide ${isAdminMode ? 'bg-gray-800 text-white border-gray-800' : 'text-gray-400 border-gray-200 hover:text-gray-600'}`}>
              {isAdminMode ? '보관함으로 가기' : '관리자 추가 모드'}
            </button>
            <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
              {(['word', 'phrase', 'both'] as const).map(m => (
                <button key={m} onClick={()=>setExtractMode(m)} className={`px-4 py-2 text-[10px] rounded-lg uppercase tracking-widest transition-all ${extractMode === m ? 'bg-white shadow-sm text-gray-800 font-bold' : 'text-gray-400'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isAdminMode && (
          <div className="mb-8 p-6 bg-gray-50 rounded-2xl border border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-4 tracking-wide">수동 단어 추가 (최근 챕터)</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <input placeholder="영어 (필수)" value={newWord.en} onChange={e => setNewWord({...newWord, en: e.target.value})} className="p-3 rounded-xl border border-gray-200 bg-white text-sm font-light outline-none focus:border-gray-400" />
              <input placeholder="한국어 뜻 (필수)" value={newWord.ko} onChange={e => setNewWord({...newWord, ko: e.target.value})} className="p-3 rounded-xl border border-gray-200 bg-white text-sm font-light outline-none focus:border-gray-400" />
              <input placeholder="유형 (예: Phrase)" value={newWord.pos} onChange={e => setNewWord({...newWord, pos: e.target.value})} className="p-3 rounded-xl border border-gray-200 bg-white text-sm font-light outline-none focus:border-gray-400" />
              <input placeholder="발음 기호" value={newWord.phonetics} onChange={e => setNewWord({...newWord, phonetics: e.target.value})} className="p-3 rounded-xl border border-gray-200 bg-white text-sm font-light outline-none focus:border-gray-400" />
            </div>
            <button onClick={handleAddWord} className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-light tracking-wide hover:bg-blue-700 transition-colors">추가하기</button>
          </div>
        )}

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
                      <div className="flex gap-2 mt-1">
                        <input className="flex-1 border-b border-gray-800 outline-none text-sm font-light py-1" value={editTitle} onChange={(e)=>setEditTitle(e.target.value)} autoFocus onKeyDown={(e)=>e.key==='Enter'&&handleRename(ch.id)} />
                        <button onClick={()=>handleRename(ch.id)} className="text-[10px] text-blue-500 font-bold">SAVE</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        <h3 className="text-sm font-medium text-gray-800">{ch.title}</h3>
                        <button onClick={()=>{setEditingChapterId(ch.id); setEditTitle(ch.title);}} className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded">EDIT</button>
                      </div>
                    )}
                    <p className="text-[10px] text-gray-400 mt-2 uppercase tracking-tighter">{ch.words.length} items</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={()=>{playChapter(ch.words)}} className="px-4 py-2 bg-gray-50 text-gray-800 text-[10px] font-bold rounded-lg hover:bg-gray-100">PLAY</button>
                    <button onClick={()=>{deleteChapter(ch.id)}} className="p-2 text-red-200 hover:text-red-500 transition-colors">
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {chapters.length === 0 && <p className="text-center text-gray-400 font-light py-10 text-sm">저장된 단어장이 없습니다.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
