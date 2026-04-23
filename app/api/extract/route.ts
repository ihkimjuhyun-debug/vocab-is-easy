import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  const { text } = await req.json();

  const prompt = `
    다음 텍스트는 사용자의 수업 노트입니다. 여기서 영어 단어, 숙어, 관용구를 추출하여 JSON 배열 형태로 반환하세요.
    - '<-' 또는 '->' 기호가 있는 경우 그 앞뒤를 단어와 뜻으로 매칭하세요.
    - 뜻이 명시되지 않은 중요 단어도 문맥을 고려해 뜻을 추가하세요.
    - 각 객체는 반드시 en(영어), ko(한국어), pos(품사), phonetics(발음기호) 키를 가져야 합니다.
    - 텍스트 중 잡담이나 학습 지침은 무시하세요.

    노트 내용: "${text}"
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // 혹은 gpt-3.5-turbo
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const data = JSON.parse(response.choices[0].message.content || '{}');
    return NextResponse.json(data.words || data);
  } catch (error) {
    return NextResponse.json({ error: 'AI 분석 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
