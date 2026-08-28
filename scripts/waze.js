const { chromium } = require('playwright');

const API = process.env.ONIBUS_API_BASE;
const KEY = process.env.WAZE_UPDATE_KEY;

if (!API) throw new Error('ONIBUS_API_BASE ausente');
if (!KEY) throw new Error('WAZE_UPDATE_KEY ausente');

function kmh(ms) {
  return Number(((Number(ms) || 0) * 3.6).toFixed(2));
}

(async () => {
  console.log('🚀 Iniciando Chromium');

  const browser = await chromium.launch({
    headless: true
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

  let raw = null;

  page.on('response', async response => {
    const url = response.url();

    if (!url.includes('/live-map/api/georss')) {
      return;
    }

    console.log('');
    console.log('📡 GEORSS DETECTADO');
    console.log('HTTP:', response.status());
    console.log('URL:', url);

    if (response.status() !== 200) {
      return;
    }

    try {
      const json = await response.json();

      if (
        json &&
        (
          Array.isArray(json.jams) ||
          Array.isArray(json.alerts)
        )
      ) {
        raw = json;

        console.log(
          '✅ Dados capturados:',
          'jams=' + (json.jams?.length || 0),
          'alerts=' + (json.alerts?.length || 0),
          'users=' + (json.users?.length || 0)
        );
      }
    } catch (e) {
      console.log(
        '⚠️ Não foi possível interpretar resposta:',
        e.message
      );
    }
  });

  console.log('🌎 Abrindo Waze Manaus');

  await page.goto(
    'https://www.waze.com/live-map/directions?to=ll.-3.1190275%2C-60.0217314',
    {
      waitUntil: 'domcontentloaded',
      timeout: 90000
    }
  );

  console.log('⏳ Esperando o próprio Waze carregar trânsito...');

  for (let i = 0; i < 45; i++) {
    if (raw) break;

    await page.waitForTimeout(1000);

    if ((i + 1) % 5 === 0) {
      console.log(
        `⏳ ${i + 1}s...`
      );
    }
  }

  if (!raw) {
    console.log('');
    console.log('❌ Nenhum GEORSS válido foi recebido.');

    console.log(
      'Página:',
      await page.title()
    );

    console.log(
      'URL final:',
      page.url()
    );

    await browser.close();

    process.exit(2);
  }

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
      Number(j.level || 0),

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
      Number(j.length || 0),

    velocidadeMs:
      Number(j.speed || 0),

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
      Number(a.nThumbsUp || 0),

    comentarios:
      Number(a.nComments || 0),

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

  const closures =
    jams.filter(j =>
      j.tipo === 'ROAD_CLOSED' ||
      j.status === 'bloqueado'
    );

  const snapshot = {
    meta: {
      fonte:
        'waze-live-map-github',

      coletadoEm:
        Date.now(),

      totais: {
        jams:
          jams.length,

        alerts:
          alerts.length,

        closures:
          closures.length,

        users:
          raw.users?.length || 0
      }
    },

    jams,
    alerts,
    closures
  };

  console.log('');
  console.log('==============================');
  console.log('🚗 Trânsito:', jams.length);
  console.log('⚠️ Alertas:', alerts.length);
  console.log('🚧 Bloqueios:', closures.length);
  console.log('==============================');

  console.log('☁️ Enviando snapshot para API...');

  const response = await fetch(
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

  const texto =
    await response.text();

  console.log(
    'API HTTP:',
    response.status
  );

  console.log(texto);

  if (!response.ok) {
    throw new Error(
      `API recusou snapshot: HTTP ${response.status}`
    );
  }

  await browser.close();

  console.log('');
  console.log('✅ WAZE → API CONCLUÍDO');
})().catch(err => {
  console.error('');
  console.error('❌ Collector:', err);
  process.exit(1);
});
