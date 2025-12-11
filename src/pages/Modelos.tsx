import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLaudo } from "@/contexts/LaudoContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, 
  MoreHorizontal, 
  Plus, 
  FileText,
  Copy,
  Pencil,
  Trash2,
  Star,
  Brain,
  Bone,
  Heart,
  Stethoscope,
  Activity
} from "lucide-react";

// Mock data for templates - will be replaced with database
const MOCK_MODELOS = [
  {
    id: "1",
    title: "Laudo Padrão - Acidente de Trabalho",
    description: "Modelo completo para perícias de acidentes de trabalho com todas as seções pré-configuradas.",
    category: "acidente_trabalho",
    isFavorite: true,
    usageCount: 45,
    createdAt: new Date("2024-01-15"),
    icon: "activity"
  },
  {
    id: "2",
    title: "Laudo Psiquiátrico - Síndrome Burnout",
    description: "Modelo especializado para avaliação de transtornos mentais relacionados ao trabalho.",
    category: "psiquiatria",
    isFavorite: true,
    usageCount: 28,
    createdAt: new Date("2024-02-20"),
    icon: "brain"
  },
  {
    id: "3",
    title: "Laudo Ortopédico - Lesões de Coluna",
    description: "Modelo para perícias envolvendo lesões na coluna vertebral e membros.",
    category: "ortopedia",
    isFavorite: false,
    usageCount: 32,
    createdAt: new Date("2024-03-10"),
    icon: "bone"
  },
  {
    id: "4",
    title: "Laudo Cardiológico - Doenças Ocupacionais",
    description: "Avaliação de doenças cardiovasculares relacionadas ao trabalho.",
    category: "cardiologia",
    isFavorite: false,
    usageCount: 12,
    createdAt: new Date("2024-04-05"),
    icon: "heart"
  },
  {
    id: "5",
    title: "Laudo Geral - Doença Ocupacional",
    description: "Modelo genérico para doenças ocupacionais diversas.",
    category: "geral",
    isFavorite: false,
    usageCount: 56,
    createdAt: new Date("2024-01-08"),
    icon: "stethoscope"
  },
  {
    id: "6",
    title: "Laudo LER/DORT",
    description: "Modelo específico para Lesões por Esforço Repetitivo e Distúrbios Osteomusculares.",
    category: "ortopedia",
    isFavorite: true,
    usageCount: 67,
    createdAt: new Date("2024-02-14"),
    icon: "activity"
  },
];

const CATEGORIES = [
  { value: "all", label: "Todos", icon: FileText },
  { value: "acidente_trabalho", label: "Acidente de Trabalho", icon: Activity },
  { value: "psiquiatria", label: "Psiquiatria", icon: Brain },
  { value: "ortopedia", label: "Ortopedia", icon: Bone },
  { value: "cardiologia", label: "Cardiologia", icon: Heart },
  { value: "geral", label: "Geral", icon: Stethoscope },
];

const getCategoryIcon = (iconName: string) => {
  switch (iconName) {
    case "brain": return Brain;
    case "bone": return Bone;
    case "heart": return Heart;
    case "stethoscope": return Stethoscope;
    case "activity": return Activity;
    default: return FileText;
  }
};

const getCategoryLabel = (category: string) => {
  const cat = CATEGORIES.find(c => c.value === category);
  return cat?.label || category;
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case "psiquiatria": return "bg-purple-100 text-purple-700";
    case "ortopedia": return "bg-blue-100 text-blue-700";
    case "cardiologia": return "bg-red-100 text-red-700";
    case "acidente_trabalho": return "bg-amber-100 text-amber-700";
    default: return "bg-slate-100 text-slate-700";
  }
};

export default function Modelos() {
  const navigate = useNavigate();
  const { createLaudo } = useLaudo();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const filteredModelos = useMemo(() => {
    return MOCK_MODELOS.filter(modelo => {
      const matchesSearch = searchTerm === "" || 
        modelo.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        modelo.description.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = selectedCategory === "all" || modelo.category === selectedCategory;
      
      return matchesSearch && matchesCategory;
    }).sort((a, b) => b.usageCount - a.usageCount);
  }, [searchTerm, selectedCategory]);

  const handleUseTemplate = async (modeloId: string) => {
    // For now, just create a new laudo - later will copy template data
    const id = await createLaudo();
    if (id) {
      navigate(`/laudo/${id}`);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Modelos de Laudos</h1>
          <p className="text-muted-foreground">
            {filteredModelos.length} modelo{filteredModelos.length !== 1 ? 's' : ''} disponíve{filteredModelos.length !== 1 ? 'is' : 'l'}
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Criar Modelo
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar modelos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Category Tabs */}
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
          <TabsList className="bg-muted/50 p-1 h-auto flex-wrap">
            {CATEGORIES.map((category) => {
              const Icon = category.icon;
              return (
                <TabsTrigger
                  key={category.value}
                  value={category.value}
                  className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  <Icon className="h-4 w-4" />
                  {category.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      {/* Models Grid */}
      {filteredModelos.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 px-4">
            <FileText className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Nenhum modelo encontrado</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Tente ajustar os filtros ou crie um novo modelo
            </p>
            <Button className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Criar Modelo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredModelos.map((modelo) => {
            const Icon = getCategoryIcon(modelo.icon);
            return (
              <Card 
                key={modelo.id} 
                className="shadow-sm hover:shadow-md transition-shadow group cursor-pointer"
                onClick={() => handleUseTemplate(modelo.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex items-center gap-2">
                      {modelo.isFavorite && (
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            handleUseTemplate(modelo.id);
                          }}>
                            <Copy className="mr-2 h-4 w-4" />
                            Usar Modelo
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <CardTitle className="text-base font-semibold mt-3 line-clamp-2">
                    {modelo.title}
                  </CardTitle>
                  <CardDescription className="text-sm line-clamp-2">
                    {modelo.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <Badge className={`${getCategoryColor(modelo.category)} font-normal`}>
                      {getCategoryLabel(modelo.category)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {modelo.usageCount} uso{modelo.usageCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
