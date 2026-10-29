import QRCode from 'qrcode';

const isLocal = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

/** 폰이 찍으면 side.html이 열리는 QR. 주소가 여러 개면 select로 고른다. */
export async function setupPhoneQr({ select, canvas, link, path = '/side.html' }) {
  let origins;
  try {
    // 이미 LAN 주소로 열었으면 그 주소를 그대로 쓴다.
    origins = isLocal()
      ? await fetch('/api/lan').then((r) => r.json())
      : [{ name: '현재 주소', url: location.origin }];
  } catch {
    origins = [];
  }

  if (!origins.length) {
    link.textContent = '네트워크 주소를 찾지 못했습니다. 노트북이 Wi-Fi에 연결돼 있는지 확인하세요.';
    canvas.hidden = true;
    select.hidden = true;
    return;
  }

  select.innerHTML = origins.map((o) => `<option value="${o.url}">${o.name} · ${o.url}</option>`).join('');
  select.hidden = origins.length < 2;

  const render = async () => {
    const url = select.value + path;
    await QRCode.toCanvas(canvas, url, { width: 180, margin: 1 });
    link.textContent = url;
  };
  select.onchange = render;
  await render();
}
