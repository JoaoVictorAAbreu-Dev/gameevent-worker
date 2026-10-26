# Validação opcional na AWS real

Nenhum recurso AWS é provisionado por este repositório durante a execução local ou CI. Custos, credenciais e permissões devem ser definidos antes de qualquer execução real.

Para configurar manualmente:

1. Criar SNS Standard, SQS Standard e DLQ na mesma região.
2. Configurar redrive da fila principal para a DLQ, `maxReceiveCount=5`, visibility timeout 60s, retenção 4/14 dias.
3. Permitir `sqs:SendMessage` na fila somente ao principal `sns.amazonaws.com`, condicionado ao ARN do tópico com `aws:SourceArn`.
4. Assinar fila no tópico e habilitar `RawMessageDelivery=true`.
5. Permitir redrive da fila de origem para a DLQ. A DLQ de consumidor não cobre falha de entrega da assinatura SNS; configurar uma DLQ da assinatura e alarmes é recomendável antes de produção.
6. Provisionar PostgreSQL e aplicar migrations separadamente, sem sincronizar schema.

Configuração para processos do host (não usar o Compose local, que fixa modo local):

```bash
MESSAGING_MODE=aws
AWS_REGION=us-east-1
SNS_TOPIC_ARN=<arn-do-topico>
SQS_QUEUE_URL=<url-da-fila>
# Remover AWS_ENDPOINT_URL do ambiente e do .env.
```

Usar a cadeia padrão de credenciais do AWS SDK: IAM role no ambiente de execução ou perfil local temporário. Nunca gravar chaves no Git. Em produção, armazenar senha PostgreSQL no Secrets Manager e injetá-la com permissões restritas; a aplicação não precisa receber acesso global ao Secrets Manager.

Permissões mínimas, com ARNs específicos:

| Processo | Ações |
|---|---|
| API | `sns:Publish` no tópico |
| Worker | `sqs:ReceiveMessage`, `sqs:DeleteMessage` na fila |
| Operador | Criar/configurar recursos e inspecionar DLQ separadamente |

`SQS_QUEUE_URL` explícita evita `GetQueueUrl` no worker real. O inicializador do repositório recusa modo AWS, preservando a separação entre provisionamento e aplicação.

Validar publicação/consumo, idempotência, política SNS→SQS, redrive, latência e custos em uma conta controlada. Apagar recursos AWS somente com autorização. Testes Moto não são prova de execução AWS real.
