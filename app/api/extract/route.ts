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
          content: `너는 최고 수준의 영어 교육 전문가야. 사용자의 러프한 텍스트에서 학습할 가치가 있는 영단어, 숙어(Idioms), 문장 템플릿을 최대한 많이 추출해 줘.
          
          [핵심 추출 규칙]
          1. '<-', '=', '->' 기호로 연결된 메모가 있다면 우선적으로 한국어 뜻으로 반영해라.
          2. **[매우 중요] 한국어 뜻은 반드시 해당 품사에 맞는 어미로 끝나야 한다.**
             - 형용사(Adjective): 반드시 '~한', '~된', '~적인' 으로 끝나야 함 (예: exaggerated -> 과장되다(X) 과장된(O), unlike -> ~와 달리(O))
             - 동사(Verb): 반드시 '~하다', '~다' 로 끝나야 함
             - 명사(Noun): 명사형태로 끝날 것
          3. 문장이나 구문의 경우 품사를 'Phrase' 또는 'Template'으로 명시해라.
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
