import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text, apiKey } = body;

    if (!apiKey) {
      return NextResponse.json({ error: 'API 키가 입력되지 않았습니다.' }, { status: 400 });
    }

    if (!text) {
      return NextResponse.json({ error: '분석할 텍스트가 없습니다.' }, { status: 400 });
    }

    // 클라이언트에서 넘겨받은 키로 OpenAI 연결
    const openai = new OpenAI({ apiKey: apiKey });

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // 비용을 줄이려면 gpt-3.5-turbo 로 변경하셔도 됩니다.
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
    console.error('OpenAI API Error:', error.message);
    
    // API 키가 틀렸거나 권한이 없을 때의 명확한 에러 처리
    if (error.status === 401) {
      return NextResponse.json({ error: '유효하지 않은 API 키입니다. 키를 다시 확인해주세요.' }, { status: 401 });
    }
    
    return NextResponse.json({ error: 'AI 분석 중 서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
