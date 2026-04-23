import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// API 키를 직접 적지 않고 환경 변수에서 읽어옵니다. (보안 완벽 해결)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
});

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    // AI에게 단어 추출 및 분석 요청
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // 혹은 gpt-3.5-turbo
      messages: [
        {
          role: "system",
          content: "너는 언어학자야. 제공된 텍스트에서 영어 단어와 숙어를 추출해. '<-' 기호가 있다면 그 뜻을 사용하고, 없다면 문맥에 맞는 한국어 뜻, 품사, 발음기호를 포함한 JSON 배열을 반환해. 반드시 { \"words\": [...] } 구조로 응답해."
        },
        { role: "user", content: text }
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    const data = JSON.parse(content || '{"words": []}');
    
    return NextResponse.json(data.words);
  } catch (error: any) {
    console.error('OpenAI Error:', error);
    return NextResponse.json({ error: 'AI 분석 실패' }, { status: 500 });
  }
}
