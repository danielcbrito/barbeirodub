# Plano de Ajuste de Layout e UI (Pesquisa e Alinhamento)

O usuário relatou que os banners e a listagem nas barbearias (unidades) estão muito esticados para os cantos e que o campo de pesquisa (em serviços e planos) está "magro" e muito afastado, precisando de mais conforto e uma estratégia minimalista/estratégica consistente.

## Ajustes de Layout Global e Alinhamento

### 1. Centralização e Margens (Full-Bleed vs Container)
- Reverter o "full-bleed" excessivo que removeu as margens laterais de conforto em dispositivos mobile.
- Ajustar `src/pages/Admin.tsx` e `src/pages/TenantAdmin.tsx` para garantir que o conteúdo das unidades tenha um `max-width` adequado ou margens internas (padding) que evitem que os banners toquem as bordas extremas da tela de forma desconfortável.

### 2. Otimização do Campo de Pesquisa
- Aumentar a altura e o preenchimento (padding) interno do campo de pesquisa em `AdminCortes.tsx`, `AdminPlanos.tsx` e `AdminDisparo.tsx`.
- Aplicar um design "mais gordo" (ex: `h-14` ou `h-16`) com bordas mais arredondadas e ícone de lupa centralizado estrategicamente para dar mais conforto visual e tátil.

## Detalhes Técnicos

### Frontend (React/Tailwind)

- **`AdminCortes.tsx` & `AdminPlanos.tsx`**: 
    - Atualizar o componente de pesquisa para usar `h-14` ou `h-16`.
    - Ajustar o container da lista para ter um `max-width-md` ou `max-width-lg` centralizado `mx-auto` em telas maiores, e `px-4` ou `px-5` em telas mobile para evitar o efeito "esticado".
- **`Admin.tsx` & `TenantAdmin.tsx`**:
    - Ajustar a lógica de `p-0` condicional para incluir um `max-w-screen-xl mx-auto` ou garantir que o padding base (`px-4`) seja mantido para conteúdo não-hero.
- **`AdminDisparo.tsx`**:
    - Garantir que a lógica de subir o botão com o teclado (`keyboardHeight`) seja mantida, mas o container da mensagem e pesquisa siga o novo padrão de largura e "gordura".

## Plano de Ação

1.  **Ajustar `Admin.tsx` e `TenantAdmin.tsx`**: Restaurar margens laterais de segurança.
2.  **Refatorar Pesquisa em `AdminCortes.tsx`**: Aumentar altura e conforto do input.
3.  **Refatorar Pesquisa em `AdminPlanos.tsx`**: Sincronizar design com a tela de serviços.
4.  **Refatorar Pesquisa em `AdminDisparo.tsx`**: Ajustar input de pesquisa para o novo padrão.
5.  **Revisar `UnidadeDetailScreen.tsx`**: Garantir que o hub central também respeite as novas margens.
