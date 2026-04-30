import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Vercel 서버 최대 대기 시간 60초 허용
export const maxDuration = 60; 
export const dynamic = 'force-dynamic';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
});

export async function POST(req: Request) {
  try {
    const { text, mode } = await req.json();

    let instruction = "";
    if (mode === 'word') {
      instruction = "긴 문장보다는 단어(Vocabulary) 위주로 추출해라.";
    } else if (mode === 'phrase') {
      instruction = "단일 단어보다는 숙어, 관용구 등 2단어 이상의 표현 위주로 추출해라.";
    } else {
      instruction = "단어와 긴 표현을 모두 포함해서 추출해라.";
    }

    const response = await openai.chat.completions.create({
      // 🔥 핵심 해결책: 속도가 3~4배 빠른 초고속 모델로 엔진 교체! (타임아웃 에러 완벽 해결)
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `너는 무조건 입력된 모든 텍스트를 100% JSON으로 변환하는 무자비한 데이터 파서(Parser)야. 자체적인 필터링이나 요약은 절대 금지한다.
          
          [🔥 절대 지켜야 할 철칙 - 무손실 100% 추출]
          1. 사용자가 입력한 텍스트가 150개든 200개든 단 하나도 빠짐없이 전부 추출해라. 
          2. 복사/붙여넣기 오류로 인해 'wash -> 경고문', 'waste -> 세탁' 처럼 영어와 한글 뜻 매칭이 어긋나 보이거나, 중간에 알파벳 'W', 'D' 같은 쓰레기 값이 있어도 절대 네 맘대로 생략하거나 멈추지 마라. 쓰레기 값만 버리고 실제 단어와 뜻은 문맥을 유추해서라도 억지로 짝을 맞춰 배열에 넣어라.
          3. "여기까지만 하자"는 식의 자체 종료는 절대 금지한다. 사용자가 입력한 텍스트의 맨 마지막 단어가 JSON 배열에 들어갈 때까지 계속 생성해라.
          
          [형식 규칙]
          - 사용자가 'n. 경고문', 'v. 물을 주다' 등 약어를 썼다면, 뜻에는 '경고문', '물을 주다'만 남기고 약어는 pos 필드(Noun, Verb 등)로 넘겨라.
          - { "words": [ { "en": "영어", "ko": "한국어 뜻(여러 개면 콤마 구분)", "pos": "품사", "phonetics": "발음기호" } ] }`
        },
        { role: "user", content: text }
      ],
      response_format: { type: "json_object" },
      // 150~200개 이상의 대용량 출력을 위해 AI의 텍스트 제한 최대로 해제
      max_tokens: 4000, 
    });

    const data = JSON.parse(response.choices[0].message.content || '{"words": []}');
    return NextResponse.json(data.words);
  } catch (error: any) {
    console.error('OpenAI API Error:', error);
    return NextResponse.json({ error: 'AI 분석 실패' }, { status: 500 });
  }
}
