# Validação local — 26/10/2026

Ambiente: Node.js 24, Docker Engine/Compose, PostgreSQL 17.11 e Moto 5.2.2. Nenhum recurso foi criado na AWS real.

| Verificação | Resultado |
|---|---|
| `npm run lint` | Aprovado, sem reescrita |
| `npm run typecheck` | Aprovado |
| `npm test` | 32 testes unitários aprovados |
| `npm run test:integration` | 22 testes aprovados com PostgreSQL real e SNS/SQS emulados |
| `npm run build` | API, worker, inicializador e scripts compilados |
| `npm audit --audit-level=low` | Nenhuma vulnerabilidade reportada |
| `npm run check:messaging` | SDK v3, SNS raw, SQS, reentrega e DLQ aprovados |
| Migrations em banco vazio | Duas migrations aplicadas em `gameevent_fresh_test`, reaplicadas sem pendências |
| Equivalência entidades/schema | Teste aprovado, sem SQL de alteração pendente |
| `npm run demo` | Publicação 202, consulta 200, repetição estável e validação 400 |
| `npm run demo:recovery` | Retomada, reinício e DLQ aprovados com timeouts reais do Compose |
| Health com banco indisponível | HTTP 503 durante parada controlada e HTTP 200 após retorno |
| Runtime Docker | API executada como usuário `node`, UID 1000 |

## Cenários que sustentam as garantias

- Cinco chamadas concorrentes com o mesmo evento produzem um processamento e quatro duplicatas, com um único resultado.
- Falha na inserção do resultado desfaz também o marcador; uma nova tentativa válida pode concluir.
- Reutilização conflitante do ID não altera o resultado original.
- Commit sem exclusão SQS, seguido de reentrega, não duplica resultado.
- Endpoint SNS inacessível retorna HTTP 503, sem sucesso fictício.
- Worker parado: API publica e consulta retorna `not_available`; retomada conclui o processamento.
- Reinício de PostgreSQL, API e worker preserva o mesmo identificador de resultado.
- Payload inválido não é confirmado e chega à DLQ após as tentativas configuradas.

A primeira execução da demonstração de recuperação usou espera de 30 segundos e encerrou antes da reentrega. O evento foi processado depois. A versão corrigida aguarda até 120 segundos na retomada, cobrindo a janela de visibilidade de 60 segundos; a repetição completa terminou com `RECOVERY PASS`.

## Limites da evidência

SNS/SQS foram exercitados por chamadas reais do SDK ao **emulador Moto**, não à AWS. IAM, custos, latência e comportamento de produção não foram validados. PostgreSQL e containers foram executados de fato.

A CI é uma evidência separada: consultar o [histórico de execuções no GitHub](https://github.com/JoaoVictorAAbreu-Dev/gameevent-worker/actions). O workflow inclui testes, build Docker e demonstração básica; a demonstração longa de recuperação é local.
