import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { toast } from "@/hooks/use-toast";

export interface LaudoData {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  status: string;
  anotacoes: string;
  peritoNome: string;
  peritoEspecialidade: string;
  peritoCRM: string;
  peritoEmail: string;
  peritoTelefone: string;
  peritoEndereco: string;
  processoNumero: string;
  processoVara: string;
  reclamante: string;
  reclamada: string;
  dataAcidente: string;
  dataPericia: string;
  documentos: string[];
  vitimaName: string;
  vitimaEscolaridade: string;
  vitimaNascimento: string;
  vitimaProfissao: string;
  vitimaDominancia: string;
  historicoOcupacional: string;
  historiaAcidente: string;
  historiaAtual: string;
  antecedentes: string;
  tratamentos: string;
  afastamentos: string;
  planejamento: string[];
  laudosMedicos: string;
  examesComplementares: string;
  exameFisico: string;
  nexoCausalTipo: string;
  nexoCausalJustificativa: string;
  conclusaoCID: string;
  conclusaoAnalise: string;
  conclusaoIncapacidade: string;
  conclusaoStatus: string;
  conclusaoJustificativa: string;
  conclusaoDestino: string;
  tabelaSUSEP: string;
  danoEstetico: string;
  auxilioTerceiros: string;
  quesitosJuizo: string;
  quesitosReclamante: string;
  quesitosReclamada: string;
}

interface LaudoContextType {
  laudos: LaudoData[];
  currentLaudo: LaudoData | null;
  loading: boolean;
  createLaudo: () => Promise<string | null>;
  loadLaudo: (id: string) => Promise<void>;
  updateLaudo: (data: Partial<LaudoData>) => void;
  saveLaudo: () => Promise<void>;
  deleteLaudo: (id: string) => Promise<void>;
  renameLaudo: (id: string, newTitle: string) => Promise<void>;
  refreshLaudos: () => Promise<void>;
}

const LaudoContext = createContext<LaudoContextType | undefined>(undefined);

export function LaudoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [laudos, setLaudos] = useState<LaudoData[]>([]);
  const [currentLaudo, setCurrentLaudo] = useState<LaudoData | null>(null);
  const [loading, setLoading] = useState<boolean>(() => !!user);

  // Ref para evitar chamadas duplicadas de refreshLaudos
  const isFetchingRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  // Carregar laudos do usuário
  const refreshLaudos = useCallback(async () => {
    if (!user) return;

    // Evitar chamadas duplicadas
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("laudos")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      if (data) {
        const mappedLaudos = data.map((dbLaudo) => ({
          id: dbLaudo.id,
          title: dbLaudo.title,
          createdAt: new Date(dbLaudo.created_at),
          updatedAt: new Date(dbLaudo.updated_at),
          status: (dbLaudo as any).status || "rascunho",
          anotacoes: (dbLaudo as any).anotacoes || "",
          peritoNome: dbLaudo.perito_nome || "",
          peritoEspecialidade: dbLaudo.perito_especialidade || "",
          peritoCRM: dbLaudo.perito_crm || "",
          peritoEmail: dbLaudo.perito_email || "",
          peritoTelefone: dbLaudo.perito_telefone || "",
          peritoEndereco: dbLaudo.perito_endereco || "",
          processoNumero: dbLaudo.processo_numero || "",
          processoVara: dbLaudo.processo_vara || "",
          reclamante: dbLaudo.reclamante || "",
          reclamada: dbLaudo.reclamada || "",
          dataAcidente: dbLaudo.data_acidente || "",
          dataPericia: dbLaudo.data_pericia || "",
          documentos: dbLaudo.documentos || [],
          vitimaName: dbLaudo.vitima_nome || "",
          vitimaEscolaridade: dbLaudo.vitima_escolaridade || "",
          vitimaNascimento: dbLaudo.vitima_nascimento || "",
          vitimaProfissao: dbLaudo.vitima_profissao || "",
          vitimaDominancia: dbLaudo.vitima_dominancia || "",
          historicoOcupacional: dbLaudo.historico_ocupacional || "",
          historiaAcidente: dbLaudo.historia_acidente || "",
          historiaAtual: dbLaudo.historia_atual || "",
          antecedentes: dbLaudo.antecedentes || "",
          tratamentos: dbLaudo.tratamentos || "",
          afastamentos: dbLaudo.afastamentos || "",
          planejamento: dbLaudo.planejamento || [],
          laudosMedicos: dbLaudo.laudos_medicos || "",
          examesComplementares: dbLaudo.exames_complementares || "",
          exameFisico: dbLaudo.exame_fisico || "",
          nexoCausalTipo: dbLaudo.nexo_causal_tipo || "",
          nexoCausalJustificativa: dbLaudo.nexo_causal_justificativa || "",
          conclusaoCID: dbLaudo.conclusao_cid || "",
          conclusaoAnalise: dbLaudo.conclusao_analise || "",
          conclusaoIncapacidade: dbLaudo.conclusao_incapacidade || "",
          conclusaoStatus: dbLaudo.conclusao_status || "",
          conclusaoJustificativa: dbLaudo.conclusao_justificativa || "",
          conclusaoDestino: dbLaudo.conclusao_destino || "",
          tabelaSUSEP: dbLaudo.tabela_susep || "",
          danoEstetico: dbLaudo.dano_estetico || "",
          auxilioTerceiros: dbLaudo.auxilio_terceiros || "",
          quesitosJuizo: dbLaudo.quesitos_juizo || "",
          quesitosReclamante: dbLaudo.quesitos_reclamante || "",
          quesitosReclamada: dbLaudo.quesitos_reclamada || "",
        }));

        setLaudos(mappedLaudos);
      }
    } catch (error: any) {
      console.error("Erro ao carregar laudos:", error);
      toast({
        variant: "destructive",
        title: "Erro ao carregar laudos",
        description: error.message,
      });
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    // Evita flash no primeiro render do Dashboard: coloca loading imediatamente ao trocar usuário
    const userId = user?.id;

    if (userId && userId !== lastUserIdRef.current) {
      lastUserIdRef.current = userId;
      setLoading(true);
      void refreshLaudos();
      return;
    }

    if (!userId) {
      lastUserIdRef.current = null;
      setLaudos([]);
      setCurrentLaudo(null);
      setLoading(false);
    }
  }, [user?.id, refreshLaudos]);

  const createLaudo = async (): Promise<string | null> => {
    if (!user) return null;

    try {
      // Get profile data to pre-fill perito information
      const { data: profileData } = await supabase
        .from('profiles')
        .select('nome, email, crm, especialidade, telefone, endereco')
        .eq('id', user.id)
        .single();

      const { data, error } = await supabase
        .from('laudos')
        .insert({
          user_id: user.id,
          title: `Laudo ${laudos.length + 1}`,
          perito_nome: profileData?.nome || '',
          perito_email: profileData?.email || '',
          perito_crm: profileData?.crm || '',
          perito_especialidade: profileData?.especialidade || '',
          perito_telefone: profileData?.telefone || '',
          perito_endereco: profileData?.endereco || '',
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        const newLaudo = {
          id: data.id,
          title: data.title,
          createdAt: new Date(data.created_at),
          updatedAt: new Date(data.updated_at),
          status: 'rascunho',
          anotacoes: '',
          peritoNome: data.perito_nome || '',
          peritoEspecialidade: data.perito_especialidade || '',
          peritoCRM: data.perito_crm || '',
          peritoEmail: data.perito_email || '',
          peritoTelefone: data.perito_telefone || '',
          peritoEndereco: data.perito_endereco || '',
          processoNumero: '',
          processoVara: '',
          reclamante: '',
          reclamada: '',
          dataAcidente: '',
          dataPericia: '',
          documentos: [],
          vitimaName: '',
          vitimaEscolaridade: '',
          vitimaNascimento: '',
          vitimaProfissao: '',
          vitimaDominancia: '',
          historicoOcupacional: '',
          historiaAcidente: '',
          historiaAtual: '',
          antecedentes: '',
          tratamentos: '',
          afastamentos: '',
          planejamento: [],
          laudosMedicos: '',
          examesComplementares: '',
          exameFisico: '',
          nexoCausalTipo: '',
          nexoCausalJustificativa: '',
          conclusaoCID: '',
          conclusaoAnalise: '',
          conclusaoIncapacidade: '',
          conclusaoStatus: '',
          conclusaoJustificativa: '',
          conclusaoDestino: '',
          tabelaSUSEP: '',
          danoEstetico: '',
          auxilioTerceiros: '',
          quesitosJuizo: '',
          quesitosReclamante: '',
          quesitosReclamada: '',
        };
        
        setCurrentLaudo(newLaudo);
        setLaudos([newLaudo, ...laudos]);
        return data.id;
      }
    } catch (error: any) {
      console.error('Erro ao criar laudo:', error);
      toast({
        variant: "destructive",
        title: "Erro ao criar laudo",
        description: error.message
      });
    }
    return null;
  };

  // Wrap loadLaudo with useCallback to stabilize its reference
  // This prevents unnecessary re-renders and fixes the typing bug
  const loadLaudo = useCallback(async (id: string) => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('laudos')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;

      if (data) {
        const laudo = {
          id: data.id,
          title: data.title,
          createdAt: new Date(data.created_at),
          updatedAt: new Date(data.updated_at),
          status: (data as any).status || 'rascunho',
          anotacoes: (data as any).anotacoes || '',
          peritoNome: data.perito_nome || '',
          peritoEspecialidade: data.perito_especialidade || '',
          peritoCRM: data.perito_crm || '',
          peritoEmail: data.perito_email || '',
          peritoTelefone: data.perito_telefone || '',
          peritoEndereco: data.perito_endereco || '',
          processoNumero: data.processo_numero || '',
          processoVara: data.processo_vara || '',
          reclamante: data.reclamante || '',
          reclamada: data.reclamada || '',
          dataAcidente: data.data_acidente || '',
          dataPericia: data.data_pericia || '',
          documentos: data.documentos || [],
          vitimaName: data.vitima_nome || '',
          vitimaEscolaridade: data.vitima_escolaridade || '',
          vitimaNascimento: data.vitima_nascimento || '',
          vitimaProfissao: data.vitima_profissao || '',
          vitimaDominancia: data.vitima_dominancia || '',
          historicoOcupacional: data.historico_ocupacional || '',
          historiaAcidente: data.historia_acidente || '',
          historiaAtual: data.historia_atual || '',
          antecedentes: data.antecedentes || '',
          tratamentos: data.tratamentos || '',
          afastamentos: data.afastamentos || '',
          planejamento: data.planejamento || [],
          laudosMedicos: data.laudos_medicos || '',
          examesComplementares: data.exames_complementares || '',
          exameFisico: data.exame_fisico || '',
          nexoCausalTipo: data.nexo_causal_tipo || '',
          nexoCausalJustificativa: data.nexo_causal_justificativa || '',
          conclusaoCID: data.conclusao_cid || '',
          conclusaoAnalise: data.conclusao_analise || '',
          conclusaoIncapacidade: data.conclusao_incapacidade || '',
          conclusaoStatus: data.conclusao_status || '',
          conclusaoJustificativa: data.conclusao_justificativa || '',
          conclusaoDestino: data.conclusao_destino || '',
          tabelaSUSEP: data.tabela_susep || '',
          danoEstetico: data.dano_estetico || '',
          auxilioTerceiros: data.auxilio_terceiros || '',
          quesitosJuizo: data.quesitos_juizo || '',
          quesitosReclamante: data.quesitos_reclamante || '',
          quesitosReclamada: data.quesitos_reclamada || '',
        };
        
        setCurrentLaudo(laudo);
      }
    } catch (error: any) {
      console.error('Erro ao carregar laudo:', error);
      toast({
        variant: "destructive",
        title: "Erro ao carregar laudo",
        description: error.message
      });
    }
  }, [user]);

  const updateLaudo = (data: Partial<LaudoData>) => {
    if (currentLaudo) {
      setCurrentLaudo({
        ...currentLaudo,
        ...data,
        updatedAt: new Date(),
      });
    }
  };

  const saveLaudo = async () => {
    if (!currentLaudo || !user) return;

    try {
      const { error } = await supabase
        .from('laudos')
        .update({
          title: currentLaudo.title,
          status: currentLaudo.status,
          anotacoes: currentLaudo.anotacoes,
          perito_nome: currentLaudo.peritoNome,
          perito_especialidade: currentLaudo.peritoEspecialidade,
          perito_crm: currentLaudo.peritoCRM,
          perito_email: currentLaudo.peritoEmail,
          perito_telefone: currentLaudo.peritoTelefone,
          perito_endereco: currentLaudo.peritoEndereco,
          processo_numero: currentLaudo.processoNumero,
          processo_vara: currentLaudo.processoVara,
          reclamante: currentLaudo.reclamante,
          reclamada: currentLaudo.reclamada,
          data_acidente: currentLaudo.dataAcidente || null,
          data_pericia: currentLaudo.dataPericia || null,
          documentos: currentLaudo.documentos,
          vitima_nome: currentLaudo.vitimaName,
          vitima_escolaridade: currentLaudo.vitimaEscolaridade,
          vitima_nascimento: currentLaudo.vitimaNascimento || null,
          vitima_profissao: currentLaudo.vitimaProfissao,
          vitima_dominancia: currentLaudo.vitimaDominancia,
          historico_ocupacional: currentLaudo.historicoOcupacional,
          historia_acidente: currentLaudo.historiaAcidente,
          historia_atual: currentLaudo.historiaAtual,
          antecedentes: currentLaudo.antecedentes,
          tratamentos: currentLaudo.tratamentos,
          afastamentos: currentLaudo.afastamentos,
          planejamento: currentLaudo.planejamento,
          laudos_medicos: currentLaudo.laudosMedicos,
          exames_complementares: currentLaudo.examesComplementares,
          exame_fisico: currentLaudo.exameFisico,
          nexo_causal_tipo: currentLaudo.nexoCausalTipo,
          nexo_causal_justificativa: currentLaudo.nexoCausalJustificativa,
          conclusao_cid: currentLaudo.conclusaoCID,
          conclusao_analise: currentLaudo.conclusaoAnalise,
          conclusao_incapacidade: currentLaudo.conclusaoIncapacidade,
          conclusao_status: currentLaudo.conclusaoStatus,
          conclusao_justificativa: currentLaudo.conclusaoJustificativa,
          conclusao_destino: currentLaudo.conclusaoDestino,
          tabela_susep: currentLaudo.tabelaSUSEP,
          dano_estetico: currentLaudo.danoEstetico,
          auxilio_terceiros: currentLaudo.auxilioTerceiros,
          quesitos_juizo: currentLaudo.quesitosJuizo,
          quesitos_reclamante: currentLaudo.quesitosReclamante,
          quesitos_reclamada: currentLaudo.quesitosReclamada,
        } as any)
        .eq('id', currentLaudo.id)
        .eq('user_id', user.id);

      if (error) throw error;

      await refreshLaudos();
      
      toast({
        title: "Laudo salvo",
        description: "Suas alterações foram salvas com sucesso.",
      });
    } catch (error: any) {
      console.error('Erro ao salvar laudo:', error);
      toast({
        variant: "destructive",
        title: "Erro ao salvar laudo",
        description: error.message
      });
    }
  };

  const deleteLaudo = async (id: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('laudos')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      setLaudos(laudos.filter(l => l.id !== id));
      
      toast({
        title: "Laudo excluído",
        description: "O laudo foi removido com sucesso.",
      });
    } catch (error: any) {
      console.error('Erro ao deletar laudo:', error);
      toast({
        variant: "destructive",
        title: "Erro ao excluir laudo",
        description: error.message
      });
    }
  };

  const renameLaudo = async (id: string, newTitle: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('laudos')
        .update({ title: newTitle })
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      // Update local state
      setLaudos(laudos.map(l => l.id === id ? { ...l, title: newTitle } : l));
      if (currentLaudo?.id === id) {
        setCurrentLaudo({ ...currentLaudo, title: newTitle });
      }
      
      toast({
        title: "Laudo renomeado",
        description: "O título foi atualizado com sucesso.",
      });
    } catch (error: any) {
      console.error('Erro ao renomear laudo:', error);
      toast({
        variant: "destructive",
        title: "Erro ao renomear laudo",
        description: error.message
      });
    }
  };

  return (
    <LaudoContext.Provider
      value={{
        laudos,
        currentLaudo,
        loading,
        createLaudo,
        loadLaudo,
        updateLaudo,
        saveLaudo,
        deleteLaudo,
        renameLaudo,
        refreshLaudos,
      }}
    >
      {children}
    </LaudoContext.Provider>
  );
}

export function useLaudo() {
  const context = useContext(LaudoContext);
  if (context === undefined) {
    throw new Error("useLaudo must be used within a LaudoProvider");
  }
  return context;
}
