-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE app_role AS ENUM ('admin', 'barber', 'cliente');
CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled_by_admin', 'cancelled_by_user', 'no_show');
CREATE TYPE subscription_status AS ENUM ('active', 'cancelled', 'past_due', 'suspended');
CREATE TYPE payment_method AS ENUM ('card', 'pix', 'cash');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
CREATE TYPE financial_entry_type AS ENUM ('income', 'expense');

-- Profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cpf TEXT UNIQUE,
  blocked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User roles table (security-first approach)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- Barbeiros table
CREATE TABLE public.barbeiros (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  apelido TEXT NOT NULL,
  comissao_pct DECIMAL(5,2) DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Serviços table
CREATE TABLE public.servicos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  descricao TEXT,
  duracao_minutos INTEGER NOT NULL,
  preco DECIMAL(10,2) NOT NULL,
  custo_produtos DECIMAL(10,2) DEFAULT 0,
  custo_mao_obra DECIMAL(10,2) DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Planos table
CREATE TABLE public.planos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  descricao TEXT,
  preco_mensal DECIMAL(10,2) NOT NULL,
  limite_agendamentos_mes INTEGER DEFAULT 4,
  prioridade_agendamento INTEGER DEFAULT 0,
  beneficios_json JSONB,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assinaturas table
CREATE TABLE public.assinaturas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plano_id UUID REFERENCES public.planos(id) NOT NULL,
  status subscription_status DEFAULT 'active',
  next_billing_date DATE,
  payment_method payment_method,
  gateway_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agendamentos table
CREATE TABLE public.agendamentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  barbeiro_id UUID REFERENCES public.barbeiros(id),
  servico_id UUID REFERENCES public.servicos(id) NOT NULL,
  data DATE NOT NULL,
  hora TIME NOT NULL,
  duracao INTEGER NOT NULL,
  status appointment_status DEFAULT 'pending',
  preco DECIMAL(10,2) NOT NULL,
  is_free BOOLEAN DEFAULT FALSE,
  usado_redemption_id UUID,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Promoções table
CREATE TABLE public.promocoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  descricao TEXT,
  pontos_necessarios INTEGER DEFAULT 5,
  weekly_required BOOLEAN DEFAULT FALSE,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pontos table
CREATE TABLE public.pontos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  promocao_id UUID REFERENCES public.promocoes(id),
  pontos INTEGER DEFAULT 0,
  last_awarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, promocao_id)
);

-- Resgates table
CREATE TABLE public.resgates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  promocao_id UUID REFERENCES public.promocoes(id),
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'used', 'expired')),
  appointment_id UUID REFERENCES public.agendamentos(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ
);

-- Pagamentos table
CREATE TABLE public.pagamentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  assinatura_id UUID REFERENCES public.assinaturas(id),
  agendamento_id UUID REFERENCES public.agendamentos(id),
  metodo payment_method NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  status payment_status DEFAULT 'pending',
  gateway_payment_id TEXT,
  data_pagamento TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Financial entries table
CREATE TABLE public.financial_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo financial_entry_type NOT NULL,
  categoria TEXT NOT NULL,
  descricao TEXT,
  valor DECIMAL(10,2) NOT NULL,
  data DATE NOT NULL,
  nota_anexo TEXT,
  related_appointment_id UUID REFERENCES public.agendamentos(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comissões table
CREATE TABLE public.comissoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbeiro_id UUID REFERENCES public.barbeiros(id) NOT NULL,
  appointment_id UUID REFERENCES public.agendamentos(id) NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  percentual DECIMAL(5,2),
  pago BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbeiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promocoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pontos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resgates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissoes ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for servicos (public read)
CREATE POLICY "Anyone can view active services" ON public.servicos
  FOR SELECT USING (ativo = TRUE);

CREATE POLICY "Admins can manage services" ON public.servicos
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for planos (public read)
CREATE POLICY "Anyone can view active plans" ON public.planos
  FOR SELECT USING (ativo = TRUE);

CREATE POLICY "Admins can manage plans" ON public.planos
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for agendamentos
CREATE POLICY "Users can view own appointments" ON public.agendamentos
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own appointments" ON public.agendamentos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins and barbers can view all appointments" ON public.agendamentos
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'barber')
  );

CREATE POLICY "Admins can manage all appointments" ON public.agendamentos
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for pontos
CREATE POLICY "Users can view own points" ON public.pontos
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage points" ON public.pontos
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for resgates
CREATE POLICY "Users can view own redemptions" ON public.resgates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage redemptions" ON public.resgates
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for financial_entries (admin only)
CREATE POLICY "Admins can manage financial entries" ON public.financial_entries
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_servicos_updated_at BEFORE UPDATE ON public.servicos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_planos_updated_at BEFORE UPDATE ON public.planos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to handle new user signup (creates profile)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, cpf)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
    NEW.raw_user_meta_data->>'cpf'
  );
  
  -- Assign default role as cliente
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'cliente');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Seed data: Insert services
INSERT INTO public.servicos (nome, descricao, duracao_minutos, preco, custo_produtos, custo_mao_obra) VALUES
  ('Corte', 'Corte de cabelo profissional', 30, 30.00, 3.00, 10.00),
  ('Barba', 'Barba completa com navalha', 20, 25.00, 2.50, 8.00),
  ('Corte + Barba', 'Combo completo de corte e barba', 60, 45.00, 5.00, 15.00),
  ('Corte com Luzes', 'Corte com aplicação de luzes', 90, 50.00, 12.00, 18.00),
  ('Corte + Alisante', 'Corte com alisamento', 75, 40.00, 10.00, 15.00),
  ('Corte + Pigmentação', 'Corte com pigmentação de barba', 75, 40.00, 8.00, 15.00);

-- Seed data: Insert plans
INSERT INTO public.planos (nome, descricao, preco_mensal, limite_agendamentos_mes, prioridade_agendamento, beneficios_json) VALUES
  ('Plano Essencial', 'Só Corte - 1 corte por semana', 90.00, 4, 1, '{"tipo": "corte", "frequencia": "semanal"}'::jsonb),
  ('Plano Premium', 'Corte + Barba - 1 combo por semana', 130.00, 4, 2, '{"tipo": "corte_barba", "frequencia": "semanal"}'::jsonb),
  ('Plano Deluxe', 'Corte + Luzes - Benefícios extras', 160.00, 4, 3, '{"tipo": "corte_luzes", "extras": true}'::jsonb),
  ('Plano Supreme', 'Corte + Alisante', 180.00, 4, 4, '{"tipo": "corte_alisante"}'::jsonb),
  ('Plano Gold', 'Corte + Pigmentação - Bônus fidelidade', 200.00, 4, 5, '{"tipo": "corte_pigmentacao", "bonus_fidelidade": true}'::jsonb);

-- Seed data: Default promotion
INSERT INTO public.promocoes (nome, descricao, pontos_necessarios, weekly_required, ativo) VALUES
  ('Corte Grátis', 'A cada 5 cortes, ganhe 1 corte grátis', 5, FALSE, TRUE);