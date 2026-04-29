import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Vercel 홈페이지에서 설정한 Environment Variable을 자동으로 가져옵니다.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
});

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: '분석할 텍스트가 없습니다.' }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "너는 언어학자야. 사용자가 적은 텍스트에서 영어 단어와 숙어를 추출해서 JSON 배열로 정리해 줘. 반드시 { \"words\": [ { \"en\": \"영어\", \"ko\": \"한국어 뜻\", \"pos\": \"품사\", \"phonetics\": \"발음기호\" } ] } 형태로 반환해."
        },
        { role: "user", content: text }
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    const data = JSON.parse(content || '{"words": []}');
    
    return NextResponse.json(data.words);

  } catch (error) {
    console.error('OpenAI API Error:', error);
    return NextResponse.json({ error: 'AI 분석 중 서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
