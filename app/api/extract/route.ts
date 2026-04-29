import { NextResponse } from 'next/server';
import OpenAI from 'openai';

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
          content: `너는 최고 수준의 영어 교육 전문가야. 사용자의 러프한 강의 노트 텍스트에서 학습할 가치가 있는 모든 것을 '최대한 많이(최소 20개 이상 권장)' 추출해 줘.
          
          [추출 규칙]
          1. 일반 영단어 뿐만 아니라 숙어(Idioms), 전환어구(Transitions, 예: on the other hand), 문장 템플릿(예: moving on to the next question)을 반드시 포함해라.
          2. '<-', '=', '->' 기호로 연결된 사용자의 메모가 있다면 우선적으로 한국어 뜻으로 반영해라.
          3. 뜻이 없는 영어 표현도 문맥을 파악해 알맞은 한국어 뜻, 품사(pos), 발음 기호(phonetics)를 채워라. 문장이나 구문의 경우 품사를 'Phrase' 또는 'Template'으로 명시해라.
          4. 반드시 { "words": [ { "en": "영어표현", "ko": "한국어 뜻", "pos": "품사/유형", "phonetics": "발음기호" } ] } 형태의 JSON 객체로 반환해라.`
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
    return NextResponse.json({ error: 'AI 분석 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
