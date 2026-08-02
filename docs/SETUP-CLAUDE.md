# 🔑 Conectar o cérebro da Sara (Claude / Anthropic)

A Sara pensa usando o Claude, da Anthropic. Você precisa de uma chave de API.

## Passo a passo

1. Acesse **https://console.anthropic.com/** e crie/entre na sua conta.
2. Adicione um método de pagamento em **Billing** (o uso é cobrado por mensagem
   trocada; um atendimento de triagem custa centavos).
3. Vá em **Settings → API Keys → Create Key**.
4. Copie a chave (começa com `sk-ant-...`).
5. No arquivo `.env` da Sara, preencha:
   ```
   ANTHROPIC_API_KEY=sk-ant-sua-chave-aqui
   SARA_MODEL=claude-sonnet-5
   ```

## Qual modelo escolher?

- `claude-sonnet-5` — **recomendado**. Ótimo em português, segue bem as regras
  clínicas e tem o melhor custo/benefício para atendimento de alto volume.
- `claude-opus-5` — máxima qualidade de raciocínio, custo mais alto. Use se
  quiser o topo de linha.

Você troca a qualquer momento mudando `SARA_MODEL` no `.env` e reiniciando.

## Dica de custo

Cada mensagem do paciente gera uma resposta curta. Para a Sara, o gasto típico
por conversa completa (da saudação ao agendamento) fica em poucos centavos de
dólar. Acompanhe o consumo em **Usage** no console da Anthropic.
