import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
});

export async function POST(req: Request) {
  try {
    const { text, mode } = await req.json();

    const response = await openai.chat.completions.create({
      model: "gpt-4o", 
      messages: [
        {
          role: "system",
          content: `너는 극단적으로 훼손된 텍스트 데이터를 복구하여 JSON으로 파싱하는 최고 수준의 데이터 엔지니어다.
          
          [🔥 무손실 복구 철칙]
          1. 사용자가 입력한 텍스트 뭉치에서 **N+1 밀림 현상(Offset)**(예: warning -> wash -> 경고문)이 발견되면 문맥을 파악해 단어와 뜻의 짝을 완벽히 맞춰라.
          2. 중간에 섞인 알파벳(W, D, F) 등 찌꺼기는 무시하되, 실제 유의미한 영단어와 한글 뜻은 단 하나도 누락 없이 파싱해라.
          
          [출력 형식]
          약어(n., v., adj.)는 뜻에서 지우고 pos 필드에 전체 품사(Noun, Verb 등)로 적어라.
          반드시 { "words": [ { "en": "영어", "ko": "한국어 뜻", "pos": "품사", "phonetics": "발음기호" } ] } 로 반환해라.`
        },
        { role: "user", content: text }
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    const data = JSON.parse(content || '{"words": []}');
    return NextResponse.json(data.words);

  } catch (error: any) {
    console.error('OpenAI API Error:', error);
    return NextResponse.json({ error: 'AI 분석 중 서버 오류 발생' }, { status: 500 });
  }
}
