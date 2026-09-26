---
name: Global barber parity
description: Barber features and visual changes must apply uniformly across every tenant without personal exceptions
type: constraint
---
Toda alteração no app Barbeiro deve funcionar para todos os barbeiros e tenants por meio do contexto autenticado e dos relacionamentos do banco.

É proibido usar nome, telefone, e-mail ou UUID de uma pessoa específica (incluindo Túlio) para controlar UI, permissões, conta financeira, WhatsApp, campanhas, planos, fidelidade ou desempenho.

Resoluções compartilhadas devem permanecer restritas ao tenant atual. Nunca usar fallback que selecione dados ou integrações de outra barbearia.