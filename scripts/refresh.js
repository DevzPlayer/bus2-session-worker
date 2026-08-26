const BASE =
  process.env.ONIBUS_API_BASE;

const UPDATE_KEY =
  process.env.BUS2_SESSION_UPDATE_KEY;

const RID =
  process.env.BUS2_RID;


function exigir(nome, valor) {
  if (!valor) {
    throw new Error(
      `${nome} não configurado`
    );
  }
}


(async () => {
  exigir(
    'ONIBUS_API_BASE',
    BASE
  );

  exigir(
    'BUS2_SESSION_UPDATE_KEY',
    UPDATE_KEY
  );

  exigir(
    'BUS2_RID',
    RID
  );


  console.log(
    '🔐 RID carregado do GitHub Secrets.'
  );

  console.log(
    `📏 Tamanho: ${RID.length} caracteres`
  );

  console.log(
    '🌐 Enviando sessão para onibus-api...'
  );


  const url =
    new URL(
      '/internal/bus2/session',
      BASE
    );


  const response =
    await fetch(
      url,
      {
        method:
          'POST',

        headers: {
          authorization:
            `Bearer ${UPDATE_KEY}`,

          'content-type':
            'application/json',

          accept:
            'application/json'
        },

        body:
          JSON.stringify({
            rid:
              RID
          })
      }
    );


  const texto =
    await response.text();


  let json;

  try {
    json =
      JSON.parse(
        texto
      );
  } catch {
    json =
      null;
  }


  console.log(
    'HTTP:',
    response.status
  );


  if (!response.ok) {
    console.error(
      '❌ Host recusou atualização.'
    );

    if (json) {
      console.error({
        error:
          json.error,

        message:
          json.message
      });
    }

    process.exit(1);
  }


  if (
    json?.success !==
    true
  ) {
    throw new Error(
      'Host não confirmou atualização'
    );
  }


  console.log(
    '✅ RID entregue e aceito pela host.'
  );

  console.log(
    '✅ Valor completo não foi exibido nos logs.'
  );
})().catch(
  erro => {
    console.error(
      '❌ Worker:',
      erro.message
    );

    process.exit(1);
  }
);
