import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: Request) {
  try {
    // 프론트엔드에서 보낸 텍스트와 API 키를 같이 받습니다.
    const { text, apiKey } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API 키가 필요합니다.' }, { status: 400 });
    }

    // 서버에 저장된 키가 아닌, 방금 유저가 넘겨준 키로 즉석에서 OpenAI를 세팅합니다.
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
    console.error('OpenAI Error:', error);
    return NextResponse.json({ error: 'AI 분석 실패. API 키가 정확한지 확인해주세요.' }, { status: 500 });
  }
}
