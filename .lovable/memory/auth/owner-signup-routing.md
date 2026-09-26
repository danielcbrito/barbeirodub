---
name: Owner signup routing
description: “Criar conta” creates a new barbershop owner, never a client account
type: feature
---
The initial “Criar conta” flow is for a new barbershop owner. It must assign/promote the user to tenant_admin, remove any cliente role, and route them to the owner onboarding/admin experience for their own barbershop. It must never land these users in the client app.