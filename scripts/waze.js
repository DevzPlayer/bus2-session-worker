const { chromium } = require('playwright');

const API = process.env.ONIBUS_API_BASE;
const KEY = process.env.WAZE_UPDATE_KEY;

if (!API) throw new Error('ONIBUS_API_BASE ausente');
if (!KEY) throw new Error('WAZE_UPDATE_KEY ausente');

const bbox = {
  top: -3.02,
  bottom: -3.20,
  left: -60.15,
  right: -59.90
};

function kmh(ms) {
  return Number(((Number(ms) || 0) * 3.6).toFixed(2));
}

(async () => {
  console.log('🚀 Iniciando Chromium');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage'
    ]
  });

  const context = await browser.newContext({
    locale: 'pt-BR',
    timezoneId: 'America/Manaus',
    viewport: {
      width: 1400,
      height: 900
    }
  });

  const page = await context.newPage();

  console.log('🌎 Abrindo Waze');

  await page.goto(
    'https://www.waze.com/live-map/directions?to=ll.-3.1190275%2C-60.0217314',
    {
      waitUntil: 'domcontentloaded',
      timeout: 90000
    }
  );

  await page.waitForTimeout(12000);

  console.log('📡 Consultando georss');

  const resposta = await page.evaluate(async bbox => {
    const p = new URLSearchParams({
      top: String(bbox.top),
      bottom: String(bbox.bottom),
      left: String(bbox.left),
      right: String(bbox.right),
      env: 'row',
      types: 'alerts,traffic,users'
    });

    const r = await fetch(
      `/live-map/api/georss?${p}`,
      {
        credentials: 'include'
      }
    );

    return {
      status: r.status,
      body: await r.text()
    };
  }, bbox);

  console.log('Waze HTTP:', resposta.status);

  if (resposta.status !== 200) {
    console.error(
      resposta.body.slice(0, 1000)
    );

    throw new Error(
      `Waze retornou HTTP ${resposta.status}`
    );
  }

  const raw = JSON.parse(resposta.body);

  const jams = (raw.jams || []).map(j => ({
    id:
      j.uuid ??
      j.id ??
      null,

    tipo:
      j.type ??
      null,

    cidade:
      j.city ??
      null,

    rua:
      j.street ??
      null,

    destino:
      j.endNode ??
      null,

    nivel:
      j.level ?? 0,

    status:
      j.type === 'ROAD_CLOSED'
        ? 'bloqueado'
        : Number(j.level) >= 4
          ? 'muito_intenso'
          : Number(j.level) >= 3
            ? 'intenso'
            : Number(j.level) >= 2
              ? 'moderado'
              : 'normal',

    comprimentoMetros:
      j.length ?? 0,

    velocidadeMs:
      j.speed ?? 0,

    velocidadeKmh:
      kmh(j.speed),

    parado:
      Number(j.speed || 0) <= 0,

    atualizadoEm:
      j.updateMillis ??
      null,

    blockUpdate:
      j.blockUpdate ??
      null,

    geometria:
      j.line ??
      [],

    segmentos:
      j.segments ??
      [],

    causa:
      j.causeAlert ??
      null
  }));

  const alerts = (raw.alerts || []).map(a => ({
    id:
      a.uuid ??
      a.id ??
      null,

    tipo:
      a.type ??
      null,

    subtipo:
      a.subtype ??
      null,

    cidade:
      a.city ??
      null,

    rua:
      a.street ??
      null,

    location:
      a.location ??
      null,

    votos:
      a.nThumbsUp ??
      0,

    comentarios:
      a.nComments ??
      0,

    confiabilidade:
      a.confidence ??
      null,

    confiabilidadeUsuario:
      a.reliability ??
      null,

    publicadoEm:
      a.pubMillis ??
      null,

    reportadoPor:
      a.reportBy ??
      null
  }));

  const closures = jams.filter(j =>
    j.tipo === 'ROAD_CLOSED' ||
    j.status === 'bloqueado'
  );

  const snapshot = {
    meta: {
      fonte:
        'waze-live-map-github',

      coletadoEm:
        Date.now(),

      bbox,

      totais: {
        jams:
          jams.length,

        alerts:
          alerts.length,

        closures:
          closures.length,

        users:
          (raw.users || []).length
      }
    },

    jams,
    alerts,
    closures
  };

  console.log('🚗 Trânsito:', jams.length);
  console.log('⚠️ Alertas:', alerts.length);
  console.log('🚧 Bloqueios:', closures.length);

  console.log('☁️ Enviando para API');

  const r = await fetch(
    new URL(
      '/internal/waze/manaus',
      API
    ),
    {
      method: 'POST',

      headers: {
        authorization:
          `Bearer ${KEY}`,

        'content-type':
          'application/json',

        accept:
          'application/json'
      },

      body:
        JSON.stringify(snapshot)
    }
  );

  const texto = await r.text();

  console.log('API HTTP:', r.status);
  console.log(texto);

  if (!r.ok) {
    throw new Error(
      `API retornou ${r.status}`
    );
  }

  await browser.close();

  console.log('✅ MANAUS ATUALIZADO');
})().catch(err => {
  console.error('❌', err);
  process.exit(1);
});
