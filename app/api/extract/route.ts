import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// 🔥 Vercel의 기본 타임아웃(10초)을 최대 60초로 연장하는 마법의 코드! (대량 추출 시 필수)
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
      instruction = "단일 단어보다는 숙어, 관용구, 템플릿 등 2단어 이상의 표현 위주로 추출해라.";
    } else {
      instruction = "단어와 긴 표현을 모두 포함해서 추출해라.";
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `너는 완벽한 데이터 파싱을 수행하는 영어 교육 AI야. 
          
          [🔥 절대 지켜야 할 철칙 - 무손실 추출]
          사용자가 입력한 텍스트에 있는 **모든 단어와 뜻을 단 하나도 빠짐없이 100% 추출해라.** 150개가 입력되면 150개를 모두 출력해야 한다. 네가 임의로 '너무 쉽다'거나 '예시'라고 판단하여 생략하거나 요약하면 절대 안 된다.
          
          [추출 모드: ${mode}]
          지시사항: ${instruction}
          
          [형식 규칙]
          1. 사용자가 'n. 경고문', 'v. 물을 주다' 처럼 품사 약어(n, v, adj, adv 등)를 포함해 적었다면, 'ko'(한국어 뜻) 필드에는 '경고문', '물을 주다' 만 남기고 약어는 지워라. 대신 'pos'(품사) 필드에 해당 품사(Noun, Verb, Adjective 등)를 명확히 기재해라.
          2. 형용사는 '~한, ~된', 동사는 '~하다, ~다' 로 어미를 일치시킬 것.
          3. 반드시 { "words": [ { "en": "영어", "ko": "한국어 뜻 여러개(콤마로 구분)", "pos": "품사", "phonetics": "발음기호" } ] } 형태의 JSON으로 반환해라.`
        },
        { role: "user", content: text }
      ],
      response_format: { type: "json_object" },
      max_tokens: 4000, // 150개 이상의 대용량 텍스트 출력을 위한 토큰 최대치 개방
    });

    const data = JSON.parse(response.choices[0].message.content || '{"words": []}');
    return NextResponse.json(data.words);
  } catch (error: any) {
    console.error('OpenAI API Error:', error);
    return NextResponse.json({ error: 'AI 분석 실패' }, { status: 500 });
  }
}
