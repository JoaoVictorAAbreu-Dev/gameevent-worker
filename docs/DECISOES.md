# Decisões de arquitetura

1. **API e worker separados no mesmo repositório.** Compartilham contratos e migrations; executam e podem ser reiniciados independentemente. Um Dockerfile possui os dois executáveis e comandos distintos.
2. **SNS Standard + SQS Standard.** Não há requisito de ordenação. Duplicatas são tratadas pelo banco. Não usamos FIFO para esconder a necessidade de idempotência.
3. **Transação e constraint única.** Evitam marcador órfão e duplicidade sob concorrência. Hash canônico diferencia reenvio seguro de reutilização conflitante de identificador.
4. **Sem outbox no produtor.** A API apenas publica e não altera estado de negócio. Retorna sucesso após confirmação SNS. Uma futura operação que também persista na API deve reavaliar dual write/outbox.
5. **Consulta sem registro de ingresso.** `not_available` não prova se houve envio. Não adicionamos estados fictícios de processamento ou tabelas de tracking para prometer algo que o sistema não observa.
6. **Moto em vez de licença LocalStack.** Compatibilidade necessária deve passar em teste executável. Sem fallback silencioso para AWS real. Moto não comprova IAM ou comportamento de produção.
7. **Contextos ORM.** HTTP usa contexto por requisição da integração Nest. Worker usa `fork()` e transação por evento, sem EntityManager global compartilhado.
8. **Concorrência inicial 1 por processo.** Reduz complexidade de drenagem e visibilidade. O banco foi testado com cinco operações concorrentes; isso não substitui teste de carga ou benchmark.
9. **Sem frontend nem integração obrigatória aos outros projetos.** A demonstração por terminal evidencia o comportamento de mensageria sem ampliar o escopo.

Referências oficiais:

- [SQS e duplicatas](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues-at-least-once-delivery.html)
- [DLQ e maxReceiveCount](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html)
- [SNS raw delivery](https://docs.aws.amazon.com/sns/latest/dg/sns-large-payload-raw-message-delivery.html)
- [AWS SDK v3 SQS](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_sqs_code_examples.html)
- [Moto Server](https://docs.getmoto.org/en/latest/docs/server_mode.html)
- [Integração NestJS/MikroORM](https://mikro-orm.io/docs/usage-with-nestjs)
