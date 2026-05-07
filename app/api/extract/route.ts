import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// 🔥 Vercel Hobby 티어의 '10초 강제 종료'를 완벽히 우회하는 유일한 방법!
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

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
          content: `너는 극단적으로 훼손된 텍스트 데이터를 100% 복구하여 JSON으로 파싱하는 최고 수준의 데이터 엔지니어다.
          
          [🔥 벤치마크 테스트 및 다중 뜻 추출 핵심 요구사항 - 무손실 복구]
          1. 사용자가 입력한 텍스트 뭉치에서 **N+1 밀림 현상(Offset)**(예: warning -> wash -> 경고문)이 발견되면 문맥과 지식을 총동원하여 영단어와 한글 뜻의 짝을 완벽히 맞춰라.
          2. 중간에 섞인 알파벳(W, D, F), 숫자(zero) 등 찌꺼기는 스스로 판단하여 무시하되, 실제 유의미한 영단어는 단 하나도 누락 없이 파싱해라.
          3. (핵심) 동사, 형용사, 명사 등 뜻이 여러 개이거나 유의어가 있는 단어는, 사용자가 다양한 유의어를 입력해도 정답 처리될 수 있도록 **반드시 콤마(,)로 구분하여 대표 뜻과 유의어를 2~3개 이상 풍부하게 추출해라.**
             (예시: "enriching" -> "풍부하게 하다, 비옥하게 하다, 질을 높이다" / "positivity" -> "긍정성, 긍정적 성향, 낙관")
          
          [출력 형식]
          약어(n., v., adj., adv.)는 뜻에서 지우고 pos 필드에 전체 품사(Noun, Verb 등)로 적어라.
          반드시 { "words": [ { "en": "영어", "ko": "한국어 뜻(콤마로 여러 개)", "pos": "품사", "phonetics": "발음기호(모르면 비움)" } ] } 로 반환해라.`
        },
        { role: "user", content: text }
      ],
      response_format: { type: "json_object" },
      max_tokens: 8192, 
    });

    const content = response.choices[0].message.content;
    const data = JSON.parse(content || '{"words": []}');
    return NextResponse.json(data.words);

  } catch (error: any) {
    console.error('OpenAI API Error:', error);
    return NextResponse.json({ error: 'AI 분석 중 서버 오류 발생' }, { status: 500 });
  }
}
