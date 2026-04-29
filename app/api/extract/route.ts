import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text, apiKey } = body;

    if (!apiKey) {
      return NextResponse.json({ error: 'API 키가 필요합니다.' }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: '텍스트를 입력해주세요.' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: apiKey });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "너는 언어학자야. 사용자가 적은 노트 텍스트에서 영어 단어와 숙어를 추출해서 JSON 배열로 정리해 줘. '<-' 또는 '->' 기호가 있으면 그 앞뒤를 단어와 뜻으로 매칭해. 반드시 { \"words\": [ { \"en\": \"영어\", \"ko\": \"한국어 뜻\", \"pos\": \"품사\", \"phonetics\": \"발음기호\" } ] } 형태로 반환해."
        },
        { role: "user", content: text }
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    const data = JSON.parse(content || '{"words": []}');
    
    return NextResponse.json(data.words);

  } catch (error: any) {
    console.error('API Error:', error.message);
    if (error.status === 401) {
      return NextResponse.json({ error: '유효하지 않은 API 키입니다.' }, { status: 401 });
    }
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
