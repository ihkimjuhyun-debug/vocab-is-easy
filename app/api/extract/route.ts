import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Vercel 10초 제한 우회 (Edge Runtime)
export const runtime = 'edge';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
});

export async function POST(req: Request) {
  try {
    const { text, mode } = await req.json();

    const response = await openai.chat.completions.create({
      // 밀림 현상을 완벽히 추론하고 재조립하기 위해 가장 똑똑한 gpt-4o 모델 사용
      model: "gpt-4o", 
      messages: [
        {
          role: "system",
          content: `너는 극단적으로 훼손된 텍스트 데이터를 100% 복구하여 JSON으로 파싱하는 최고 수준의 데이터 엔지니어다.
          
          [🔥 벤치마크 테스트 핵심 요구사항 - 무손실 복구]
          1. 현재 사용자가 입력한 데이터는 복사/붙여넣기 오류로 인해 **N+1 밀림 현상(Offset)**이 발생했다.
             (예: 'warning' -> 'wash' -> 'n. 경고문' -> 'washing' -> 'n. 씻기' => warning의 뜻이 경고문, wash의 뜻이 씻기로 매칭되어야 함)
          2. 중간에 섞여 있는 'W', 'D', 'F', 'zero' 같은 알파벳이나 무의미한 찌꺼기는 스스로 판단하여 무시하되, 실제 유의미한 150여 개의 영단어와 한글 뜻은 문맥과 지식을 총동원하여 **단 하나도 누락 없이 완벽한 짝을 찾아 배열해라.**
          3. 데이터가 150개가 넘더라도 도중에 절대 멈추지 마라. 끝까지 파싱해서 출력해야 한다.
          
          [출력 형식]
          반드시 다음 JSON 형태만 출력해라. 약어(n., v., adj., adv.)는 뜻에서 제거하고 pos 필드에 전체 이름(Noun, Verb 등)으로 적어라.
          {
            "words": [
              { "en": "영어단어", "ko": "한국어 뜻(정확히 매칭된 뜻)", "pos": "품사", "phonetics": "발음기호(모르면 비워둠)" }
            ]
          }`
        },
        { role: "user", content: text }
      ],
      response_format: { type: "json_object" },
      // 🔥 150개 이상의 대규모 JSON 변환 시 토큰이 잘리는 현상을 막기 위해 한도를 대폭 상향
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
