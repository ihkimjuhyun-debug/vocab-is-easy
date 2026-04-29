'use client';
import { useState, useEffect } from 'react';

interface Word {
  en: string;
  ko: string;
  pos: string;
  phonetics: string;
}

interface Chapter {
  id: string;
  title: string;
  words: Word[];
}

export default function AIWordMaster() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [chapters, setChapters] = useState<Chapter[]>([]);
  
  const [activeWords, setActiveWords] = useState<Word[]>([]);
  const [answer, setAnswer] = useState('');
  const [isEnToKo, setIsEnToKo] = useState(true);
  
  // 💡 새롭게 추가된 상태: 총 단어 수와 완료 여부 추적
  const [totalWordsCount, setTotalWordsCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [newWord, setNewWord] = useState({ en: '', ko: '', pos: 'Noun', phonetics: '' });

  useEffect(() => {
    const savedData = localStorage.getItem('my_word_storage');
    if (savedData) {
      setChapters(JSON.parse(savedData));
    }
  }, []);

  const saveToStorage = (newChapters: Chapter[]) => {
    setChapters(newChapters);
    localStorage.setItem('my_word_storage', JSON.stringify(newChapters));
  };

  const getFormattedDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  };

  const startAIAnalysis = async () => {
    if (!text.trim()) return alert('노트 내용을 입력해주세요!');
    
    setLoading(true);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      
      if (!res.ok) throw new Error('서버 통신 오류');
      
      const data: Word[] = await res.json();
      if (data && data.length > 0) {
        const timeStamp = getFormattedDate();
        const newChapter: Chapter = {
          id: Date.now().toString(),
          title: `${timeStamp} 추출된 단어장`,
          words: data
        };
        
        saveToStorage([newChapter, ...chapters]);
        setText('');
        alert(`${data.length}개의 단어가 새로운 챕터로 저장되었습니다!`);
      } else {
        alert('추출할 수 있는 단어가 없습니다.');
      }
    } catch (e) {
      alert('분석 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddWord = () => {
    if (!newWord.en || !newWord.ko) return alert('영어와 한국어 뜻은 필수입니다.');
    if (chapters.length === 0) return alert('먼저 AI 추출을 통해 챕터를 생성해주세요.');

    const updatedChapters = [...chapters];
    updatedChapters[0].words.push(newWord); 
    
    saveToStorage(updatedChapters);
    setNewWord({ en: '', ko: '', pos: 'Noun', phonetics: '' });
    alert('가장 최근 단어장에 수동으로 추가되었습니다.');
  };

  const handleCheck = () => {
    if (activeWords.length === 0 || !answer.trim()) return;
    
    const current = activeWords[0];
    const target = isEnToKo ? current.ko : current.en;

    const cleanUser = answer.trim().replace(/\s/g, '').toLowerCase();
    const cleanTarget = target.trim().replace(/\s/g, '').toLowerCase();

    if (cleanTarget.includes(cleanUser) && cleanUser.length >= cleanTarget.length * 0.8) {
      const remaining = activeWords.slice(1);
      setActiveWords(remaining);
      
      // 💡 마지막 단어를 맞췄을 때 완료 화면 띄우기
      if (remaining.length === 0) {
        setIsFinished(true);
      }
    } else {
      alert(`❌ 오답입니다. 정답은 [ ${target} ] 입니다.\n큐의 맨 뒤에서 다시 출제됩니다.`);
      setActiveWords((prev) => {
        const failedWord = prev[0];
        return [...prev.slice(1), failedWord];
      });
    }
    setAnswer('');
  };

  // 💡 게임 시작 시 총 단어 수를 기록
  const playChapter = (chapterWords: Word[]) => {
    if (chapterWords.length === 0) return alert('이 챕터에는 단어가 없습니다.');
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
  };

  // 🎉 완료 축하 화면
  if (isFinished) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#fafafa]">
        <div className="w-full max-w-md p-10 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center">
          <div className="text-5xl mb-6">🎉</div>
          <h2 className="text-2xl font-normal text-gray-800 mb-2 tracking-tight">축하합니다!</h2>
          <p className="text-gray-500 font-light mb-10 leading-relaxed">
            오늘의 단어 <span className="font-medium text-gray-800">{totalWordsCount}</span>개를<br/>전부 완료하셨습니다.
          </p>
          <button 
            onClick={quitGame}
            className="w-full bg-gray-900 text-white py-4 rounded-xl font-light tracking-wider hover:bg-gray-800 transition-all active:scale-[0.98]"
          >
            보관함으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  // 🎮 게임 진행 화면
  if (activeWords.length > 0 && !isAdminMode) {
    const current = activeWords[0];
    const progressPercentage = ((totalWordsCount - activeWords.length) / totalWordsCount) * 100;

    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#fafafa]">
        <div className="w-full max-w-md p-10 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center relative">
          
          <button 
            onClick={quitGame}
            className="absolute top-6 left-6 text-[10px] text-gray-400 hover:text-gray-600 uppercase tracking-widest transition-colors flex items-center gap-1"
          >
            ← 종료
          </button>

          {/* 💡 진척도(Progress Bar) 영역 */}
          <div className="w-full mt-6 mb-8">
            <div className="flex justify-between text-[10px] text-gray-400 uppercase tracking-widest mb-2 font-light">
              <span>{totalWordsCount - activeWords.length} completed</span>
              <span>{totalWordsCount} total</span>
            </div>
            <div className="w-full bg-gray-100 h-1 rounded-full overflow-hidden">
              <div 
                className="bg-gray-800 h-full transition-all duration-300 ease-out" 
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
          </div>

          <p className="text-xs font-medium tracking-widest text-gray-400 mb-8 uppercase">
            {isEnToKo ? "Translate to Korean" : "Type in English"}
          </p>
          
          <h2 className="text-4xl font-normal mb-3 text-gray-800 break-words text-center">
            {isEnToKo ? current.en : current.ko}
          </h2>
          
          <div className="flex items-center gap-2 mb-10 text-gray-400 font-light">
            <span className="text-sm">{current.phonetics}</span>
            <span className="text-[10px] uppercase border border-gray-200 px-2 py-0.5 rounded-full">{current.pos}</span>
          </div>
          
          <input 
            className="w-full p-4 border-b border-gray-200 bg-transparent mb-8 text-center text-xl font-light focus:border-gray-800 outline-none transition-colors"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
            placeholder="답변을 입력하세요"
            autoFocus
            spellCheck="false"
          />
          
          <button 
            onClick={handleCheck} 
            className="w-full bg-gray-900 text-white py-4 rounded-xl font-light tracking-wider hover:bg-gray-800 transition-all active:scale-[0.98]"
          >
            확인
          </button>
          
          <button 
            onClick={() => setIsEnToKo(!isEnToKo)} 
            className="mt-6 text-gray-400 text-xs font-light hover:text-gray-600 transition-colors"
          >
            모드 전환
          </button>
        </div>
      </div>
    );
  }

  // 🏠 메인 및 보관함 화면
  return (
    <div className="flex flex-col items-center min-h-screen p-6 bg-[#fafafa] pt-12">
      <div className="w-full max-w-2xl bg-white p-10 rounded-2xl shadow-sm border border-gray-100 relative">
        
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-light text-gray-800 tracking-tight">AI Word Master</h1>
            <p className="text-gray-400 mt-1 font-light text-sm">추출된 단어는 기기에 영구적으로 자동 보관됩니다.</p>
          </div>
          <button 
            onClick={() => setIsAdminMode(!isAdminMode)}
            className={`text-xs px-4 py-2 border rounded-full transition-colors font-light tracking-wide ${isAdminMode ? 'bg-gray-800 text-white border-gray-800' : 'text-gray-400 border-gray-200 hover:text-gray-600'}`}
          >
            {isAdminMode ? '보관함으로 돌아가기' : '관리자 모드'}
          </button>
        </div>

        {isAdminMode && (
          <div className="mb-8 p-6 bg-gray-50 rounded-xl border border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-4 tracking-wide">수동 단어 추가 (가장 최근 챕터에 추가됨)</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <input placeholder="영어 (필수)" value={newWord.en} onChange={e => setNewWord({...newWord, en: e.target.value})} className="p-3 rounded-lg border border-gray-200 bg-white text-sm font-light outline-none focus:border-gray-400" />
              <input placeholder="한국어 뜻 (필수)" value={newWord.ko} onChange={e => setNewWord({...newWord, ko: e.target.value})} className="p-3 rounded-lg border border-gray-200 bg-white text-sm font-light outline-none focus:border-gray-400" />
              <input placeholder="품사 (예: Noun)" value={newWord.pos} onChange={e => setNewWord({...newWord, pos: e.target.value})} className="p-3 rounded-lg border border-gray-200 bg-white text-sm font-light outline-none focus:border-gray-400" />
              <input placeholder="발음 기호" value={newWord.phonetics} onChange={e => setNewWord({...newWord, phonetics: e.target.value})} className="p-3 rounded-lg border border-gray-200 bg-white text-sm font-light outline-none focus:border-gray-400" />
            </div>
            <button onClick={handleAddWord} className="w-full bg-blue-600 text-white py-3 rounded-lg text-sm font-light tracking-wide hover:bg-blue-700 transition-colors">최근 챕터에 추가하기</button>
          </div>
        )}
        
        <textarea 
          className="w-full h-48 p-6 bg-gray-50 border border-gray-100 rounded-xl mb-6 focus:border-gray-300 outline-none resize-none text-gray-700 font-light leading-relaxed"
          placeholder="새로 배운 노트나 문장을 여기에 붙여넣고 새로운 챕터를 만드세요..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button 
          onClick={startAIAnalysis}
          disabled={loading}
          className="w-full bg-gray-900 text-white py-4 rounded-xl font-light tracking-wider hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 transition-all active:scale-[0.99] flex justify-center items-center mb-12"
        >
          {loading ? "분석 및 저장 중..." : "AI 추출 및 챕터 저장"}
        </button>

        <div className="border-t border-gray-100 pt-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-normal text-gray-800 tracking-tight">📚 내 단어장 보관함</h2>
            {chapters.length > 0 && (
              <button 
                onClick={playAllWords}
                className="bg-blue-50 text-blue-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
              >
                전체 단어 복습하기
              </button>
            )}
          </div>

          {chapters.length === 0 ? (
            <p className="text-center text-gray-400 font-light py-10 text-sm">저장된 단어장이 없습니다. 위에서 텍스트를 추출해 보세요.</p>
          ) : (
            <div className="space-y-3">
              {chapters.map((chapter) => (
                <div key={chapter.id} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-colors">
                  <div>
                    <h3 className="text-sm font-medium text-gray-800">{chapter.title}</h3>
                    <p className="text-xs text-gray-400 mt-1 font-light">단어 {chapter.words.length}개</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => playChapter(chapter.words)}
                      className="px-4 py-2 bg-gray-900 text-white text-xs font-light rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      학습하기
                    </button>
                    <button 
                      onClick={() => deleteChapter(chapter.id)}
                      className="px-3 py-2 text-red-400 text-xs font-light hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
