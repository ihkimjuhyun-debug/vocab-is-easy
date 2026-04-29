import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
});

export async function POST(req: Request) {
  try {
    const { text, mode } = await req.json(); // mode: 'word' | 'phrase' | 'both'

    let instruction = "";
    if (mode === 'word') {
      instruction = "긴 문장보다는 핵심적인 '단어(Vocabulary)' 위주로 20개 이상 추출해 줘.";
    } else if (mode === 'phrase') {
      instruction = "단일 단어보다는 숙어, 관용구, 템플릿 등 3단어 이상의 '표현(Expressions/Phrases)' 위주로 20개 이상 추출해라. 짧은 단어만 추출하는 불상사가 없도록 해.";
    } else {
      instruction = "단어와 긴 표현을 골고루 섞어서 최대한 많이(25개 이상) 추출해 줘.";
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `너는 영어 교육 전문가야. 사용자의 노트에서 다음 지시에 따라 학습 카드를 만들어.
          
          [추출 모드: ${mode}]
          지시사항: ${instruction}
          
          [필수 규칙]
          1. '<-', '=', '->' 기호가 있는 메모는 최우선적으로 정답으로 반영할 것.
          2. 형용사는 '~한, ~된', 동사는 '~하다' 등 품사에 맞는 한국어 어미를 철저히 지킬 것.
          3. 표현 모드일 경우 문맥상 중요한 덩어리(Chunks)를 우선순위로 둘 것.
          4. 반드시 { "words": [ { "en": "영어", "ko": "한국어 뜻(유사어 포함)", "pos": "품사", "phonetics": "발음" } ] } 형태의 JSON으로 반환해.`
        },
        { role: "user", content: text }
      ],
      response_format: { type: "json_object" },
    });

    const data = JSON.parse(response.choices[0].message.content || '{"words": []}');
    return NextResponse.json(data.words);
  } catch (error: any) {
    return NextResponse.json({ error: 'AI 분석 실패' }, { status: 500 });
  }
}
