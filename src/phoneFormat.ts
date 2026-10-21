/**
 * 숫자만 입력해도 한국 전화번호 형식(하이픈 자동 삽입)으로 변환합니다.
 * 예) "01034564567" -> "010-3456-4567"
 * 예) "0212345678"  -> "02-1234-5678" (서울 지역번호)
 * 예) "031784111"   -> "031-784-111" (경기 등 3자리 지역번호, 입력 중)
 *
 * 이미 하이픈이 섞여 입력돼도 숫자만 추출해서 다시 규칙대로 조립하므로
 * 붙여넣기(paste)된 번호도 동일하게 정리됩니다.
 *
 * [수정] 예전엔 "+82.10.8288.3981"처럼 국가번호(+82)가 붙은 국제 표기가 입력되면,
 * 숫자만 남기는 과정에서 "+"가 사라지고 "82"가 마치 국내 번호의 국번(예: 010의 "01")인
 * 것처럼 취급돼서 "821-0828-8398"처럼 완전히 엉뚱하게 잘못 재조립되는 버그가 있었다.
 * 이제는 맨 앞에 "+"가 있으면 국제번호로 인식해서, 국가번호(+82 등)는 그대로 떼어
 * 앞에 붙여두고, 그 뒤에 이어지는 번호만 국내 규칙으로 포맷한다(국제 표기에서는
 * 맨 앞자리 "0"을 보통 생략하므로, 예: "+82 10-8288-3981").
 */
export function formatPhoneNumber(value: string): string {
  const trimmed = (value || '').trim();

  if (trimmed.startsWith('+')) {
    // "+82.10.8288.3981" / "+82 10 8288 3981" 등에서, 국가번호(보통 1~3자리)와
    // 그 뒤의 실제 번호를 분리한다. 한국 번호(+82)가 압도적으로 많으므로 그 경우엔
    // 국가번호 2자리로 정확히 잘라내고, 그 외 국가번호는 구분자(공백/점 등) 기준으로
    // 첫 덩어리를 국가번호로 본다.
    const digitsOnly = trimmed.slice(1).replace(/[^\d]/g, '');
    let countryCode: string;
    let rest: string;
    if (digitsOnly.startsWith('82')) {
      countryCode = '82';
      rest = digitsOnly.slice(2);
    } else {
      // 구분자(공백, 점, 하이픈) 기준으로 첫 덩어리를 국가번호로 취급
      const firstSegMatch = trimmed.slice(1).match(/^(\d{1,3})[.\s-]/);
      countryCode = firstSegMatch ? firstSegMatch[1] : digitsOnly.slice(0, 2);
      rest = digitsOnly.slice(countryCode.length);
    }

    // 국제 표기에서는 맨 앞의 "0"(국내 전용 트렁크 코드)을 보통 생략한다(예: "010"이
    // "10"으로 표기됨). 다만 국내 포맷 규칙(formatDomesticDigits)은 "0"이 붙어있다는
    // 전제로 몇 자리씩 끊을지 판단하므로, 없으면 임시로 다시 붙여서 포맷한 뒤 결과에서
    // 그 "0"만 다시 떼어낸다.
    const withLeadingZero = rest.startsWith('0') ? rest : `0${rest}`;
    const restFormatted = formatDomesticDigits(withLeadingZero).replace(/^0/, '');
    return restFormatted ? `+${countryCode} ${restFormatted}` : `+${countryCode}`;
  }

  return formatDomesticDigits(trimmed.replace(/[^\d]/g, '').slice(0, 11));
}

// 국내 번호(0으로 시작하는 일반적인 표기) 숫자열을 하이픈 규칙에 맞게 조립하는
// 내부 함수. formatPhoneNumber(국내)와 국제번호의 "국가번호 뒷부분" 포맷팅이
// 공유해서 쓴다.
function formatDomesticDigits(numbers: string): string {
  if (numbers.startsWith('02')) {
    // 서울 지역번호 (02-XXX-XXXX 또는 02-XXXX-XXXX)
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 5) return `${numbers.slice(0, 2)}-${numbers.slice(2)}`;
    if (numbers.length <= 9) return `${numbers.slice(0, 2)}-${numbers.slice(2, 5)}-${numbers.slice(5)}`;
    return `${numbers.slice(0, 2)}-${numbers.slice(2, 6)}-${numbers.slice(6, 10)}`;
  }

  // 휴대폰(010 등) 및 그 외 3자리 지역번호(031/032/053 등)
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  if (numbers.length <= 10) return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6)}`;
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
}
