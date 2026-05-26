# Motivador Diario

Aplicativo Android (Kotlin) + servidor REST para enviar frases motivacionais reais, com autor, sem repeticao por dispositivo.

## Visao Geral
- O app agenda 2 buscas diarias:
  - 05:00, periodo `manha`
  - 18:00, periodo `tarde`
- Em cada horario, o app chama a API REST do servidor e exibe uma notificacao local com a frase.
- O app mantem cache/historico local (Room). Se estiver offline, mostra a ultima frase salva.
- O servidor mantem historico por `device_id` e evita reenviar o mesmo texto para o mesmo aparelho.

## Estrutura
- `app/`: projeto Android
- `server/`: servidor Node.js/Express + SQLite
- `motivador/`: copia isolada do servidor usada no deploy Node.js

## Servidor
### Requisitos
- Node.js 18+

### Instalacao
```bash
cd server
npm install
```

### Configuracao
Crie um arquivo `.env` em `server/` ou use variaveis de ambiente:
```env
PORT=8080
API_KEY=troque-esta-chave
SQLITE_PATH=./data/motivador.sqlite
RESEARCH_TIMEOUT_MS=12000
RESEARCH_USER_AGENT=Mozilla/5.0 (compatible; MotivadorDiario/1.7; +https://seu-dominio.com)
PENSADOR_BASE_URL=https://www.pensador.com
PENSADOR_CACHE_TTL_MS=21600000
PENSADOR_PAGE_LIMIT=12
PENSADOR_MIN_QUOTES=45
PENSADOR_MAX_EMPTY_ATTEMPTS=3
```

### Fonte Das Frases
- O servidor nao guarda frases prontas no codigo.
- O servidor nao usa IA paga nem gerador local para inventar frases.
- As frases sao extraidas de paginas do Pensador.com, com texto e autor.
- `manha` prioriza paginas de motivacao e bom dia.
- `tarde` prioriza reflexao, gratidao, paz e boa noite.
- O cache evita bater no site a cada requisicao e o historico por aparelho impede repeticao.
- A coleta externa e feita gradualmente e funciona tambem em runtimes Node.js sem `fetch` global.

Paginas pesquisadas podem ser ajustadas:
```env
PENSADOR_PATHS_MANHA=frases_motivacionais,frases_de_motivacao,frases_de_bom_dia,mensagens_de_bom_dia,frases_de_reflexao
PENSADOR_PATHS_TARDE=frases_de_reflexao,frases_motivacionais,frases_de_gratidao,frases_de_paz,frases_de_boa_noite,mensagens_de_boa_noite
```

### Executar
```bash
npm run dev
```

### Endpoints
- `GET http://localhost:8080/api/frase?periodo=manha`
- `GET http://localhost:8080/api/frase?periodo=tarde`
- `GET http://localhost:8080/api/teste`
- `GET https://motivador.sysdev2.serv00.net/api/frase?periodo=manha`
- `GET https://motivador.sysdev2.serv00.net/api/frase?periodo=tarde`
- `GET https://motivador.sysdev2.serv00.net/api/teste`

`/api/teste` pode ser aberto diretamente no navegador, sem headers. Use-o para confirmar
que a API esta online e conseguindo obter frases na fonte externa.

`/api/frase` e exclusivo do aplicativo e exige os headers que mantem historico individual
por aparelho:
- `x-api-key: <API_KEY>`
- `x-device-id: <id-unico-do-dispositivo>`

Resposta:
```json
{
  "id": "quote-2026-05-24-manha-...",
  "texto": "...",
  "autor": "...",
  "tipo": "historica",
  "periodo": "manha"
}
```

## App Android
Edite `app/src/main/java/com/motivador/diario/network/ApiConfig.kt`:
- `BASE_URL` (atual: `https://motivador.sysdev2.serv00.net/`)
- `API_KEY`

## Deploy No Serv00
- Use a pasta `motivador/` como projeto Node.js isolado para publicar no host.
- O Serv00 espera um `app.js` na raiz de `public_nodejs`; este repositorio ja inclui esse entrypoint.
- Depois de copiar os arquivos para `domains/motivador.sysdev2.serv00.net/public_nodejs/`, rode `npm install`.
- Remova o arquivo padrao `public/index.html` criado pelo Serv00, senao a raiz `/` continuara mostrando a pagina padrao deles.
- Reinicie o dominio Node.js no painel do Serv00 ou via shell para carregar a aplicacao nova.

## Observacoes
- O agendamento usa WorkManager com `PeriodicWorkRequest` (24h) e `initialDelay` calculado para o proximo 05:00/18:00 no fuso do dispositivo.
- Se o app for forcado a parar ou sofrer restricoes de bateria, o Android pode atrasar execucoes. O WorkManager garante execucao eventual.
