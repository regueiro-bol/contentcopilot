// ============================================================
// Tipos e interfaces principales de ContentCopilot
// Jerarquía: Cliente → Proyectos → Contenidos
// ============================================================

// ─────────────────────────────────────────────────────────────
// NIVEL 1: Cliente — entidad corporativa
// ─────────────────────────────────────────────────────────────

/**
 * Representa un cliente de la agencia (nivel corporativo)
 */
export interface Cliente {
  id: string
  nombre: string
  slug: string
  sector: string
  url_web: string
  logo_url?: string
  activo: boolean
  created_at: string

  // Contexto corporativo
  descripcion: string                  // contexto empresarial general
  restricciones_globales: string[]     // palabras/temas prohibidos en TODOS sus proyectos
  identidad_corporativa: string        // tono y valores de marca a nivel global

  // Gestión
  account_manager_id: string
}

// ─────────────────────────────────────────────────────────────
// NIVEL 2: Proyecto — canal o línea editorial
// ─────────────────────────────────────────────────────────────

/**
 * Documento subido a la base documental de un proyecto
 */
export interface DocumentoProyecto {
  id: string
  nombre: string
  tipo: 'estilo' | 'contenido' | 'brief' | 'guia_marca' | 'otro'
  url: string
  fecha_subida: string
  tamanyo_kb: number
  descripcion?: string
  // RAG — persistido en el JSONB del proyecto
  estado_rag?: 'procesado'
  chunks_generados?: number
  fecha_procesado?: string
}

/**
 * Proyecto — nivel intermedio. Canal editorial con su propia
 * configuración de tono, SEO, base documental y entrega.
 * Ej: "Blog Impulsa Empresa", "Blog Corporativo", "LinkedIn".
 */
export interface Proyecto {
  id: string
  nombre: string
  slug: string
  cliente_id: string
  activo: boolean
  created_at: string

  // Descripción
  descripcion: string

  // Voz editorial
  tono_voz: string
  etiquetas_tono: string[]
  keywords_objetivo: string[]
  keywords_prohibidas: string[]
  tematicas_autorizadas: string[]
  tematicas_vetadas: string[]
  perfil_lector: string

  // Modo de trabajo
  modo_creativo: boolean  // true = autor primero, false = cliente primero

  // Entrega
  modo_entrega: 'drive' | 'cms' | 'word' | 'email'
  cms_url?: string
  drive_carpeta_url?: string
  wordpress_url?: string
  excel_seo_url?: string
  contacto_aprobacion_nombre?: string
  contacto_aprobacion_email?: string

  // Base documental (RAG)
  documentos_subidos: DocumentoProyecto[]
  rag_ultima_actualizacion?: string
  rag_num_documentos?: number

  // Relación (optional para joins)
  cliente?: Cliente
}

// ─────────────────────────────────────────────────────────────
// NIVEL 3: Contenido — pieza individual de contenido
// ─────────────────────────────────────────────────────────────

/**
 * Brief SEO generado por el Agente Brief SEO
 */
export interface BriefSEO {
  // Texto completo generado por el agente de IA (Dify)
  // Si existe, tiene prioridad sobre los campos estructurados
  texto_generado?: string

  keyword_principal: string
  titulo_propuesto: string
  url_prevista: string
  tipo_keyword: string
  tipo_serp: string
  description_propuesta: string
  respuesta_directa: string
  featured_snippet: boolean
  estructura_h: string
  keywords_secundarias: string[]
  fuentes: string[]
  links_obligatorios: string[]
  formato_recomendado: string
  enfoque: string
  observaciones_seo: string
  volumen_busquedas?: number
  url_ganadora?: string
  tamanyo_texto_min?: number
  tamanyo_texto_max?: number
}

/**
 * Estado de un contenido en el flujo editorial
 */
export type EstadoContenido =
  | 'pendiente'
  | 'borrador'
  | 'revision_seo'
  | 'revision_cliente'
  | 'devuelto'
  | 'aprobado'
  | 'publicado'

/**
 * Contenido — pieza individual (artículo, post, newsletter…)
 * antes llamada "Proyecto" en la arquitectura anterior.
 */
export interface Contenido {
  id: string
  titulo: string
  slug: string
  proyecto_id: string
  cliente_id: string
  activo: boolean
  created_at: string

  // Estado en el flujo
  estado: EstadoContenido

  // Asignación
  redactor_id?: string

  // SEO
  keyword_principal?: string
  url_destino?: string

  // Planificación
  fecha_entrega?: string
  tamanyo_texto_min?: number
  tamanyo_texto_max?: number

  // Brief y entrega
  brief?: BriefSEO
  url_publicado?: string
  link_drive?: string
  texto_contenido?: string
  notas_iniciales?: string

  // Relaciones (optional para joins)
  proyecto?: Proyecto
  cliente?: Cliente
}

// ─────────────────────────────────────────────────────────────
// Entidades auxiliares
// ─────────────────────────────────────────────────────────────

/**
 * Perfil de autor (biblioteca transversal)
 */
export interface PerfilAutor {
  id: string
  nombre: string
  email?: string
  bio?: string
  especialidad?: string
  activo: boolean
  created_at: string
}

/**
 * Tipos de agentes de IA disponibles en la plataforma
 */
export type AgentType =
  | 'redactor_blog'
  | 'redactor_social'
  | 'redactor_email'
  | 'seo_optimizer'
  | 'brief_seo'
  | 'analizador_tono'
  | 'generador_ideas'
  | 'corrector_estilo'
  | 'traductor'

/**
 * Configuración de un agente de IA
 */
export interface Agente {
  id: string
  tipo: AgentType
  nombre: string
  descripcion: string
  icono: string
  activo: boolean
  modelo: 'claude' | 'dify'
  configuracion?: Record<string, unknown>
}

/**
 * Mensaje en una conversación con el copiloto de IA
 */
export interface ConversationMessage {
  id: string
  rol: 'usuario' | 'asistente' | 'sistema'
  contenido: string
  timestamp: string
  metadatos?: {
    modelo?: string
    tokens_usados?: number
    agente_tipo?: AgentType
  }
}

/**
 * Sesión de conversación del copiloto
 */
export interface ConversacionCopiloto {
  id: string
  proyecto_id?: string
  cliente_id?: string
  mensajes: ConversationMessage[]
  titulo?: string
  creado_en: string
  actualizado_en: string
}

/**
 * Estadísticas del dashboard
 */
export interface DashboardStats {
  total_clientes: number
  total_proyectos: number
  total_contenidos: number
  contenidos_activos: number
  contenidos_publicados_mes: number
  palabras_generadas_mes: number
}

/**
 * Respuesta paginada de la API
 */
export interface PaginatedResponse<T> {
  datos: T[]
  total: number
  pagina: number
  por_pagina: number
  tiene_siguiente: boolean
}

// ─────────────────────────────────────────────────────────────
// NIVEL 4: Pedido — orden de trabajo editorial
// ─────────────────────────────────────────────────────────────

export type TipoPedido = 'docx' | 'excel' | 'manual'
export type EstadoPedido = 'procesando' | 'completado' | 'error'

/**
 * Artículo detectado en un DOCX (H1 = separador entre artículos)
 */
export interface ArticuloDetectado {
  titulo: string
  estructuraH: string
  comentarios: string[]
  keyword: string
  // Campos opcionales del paso de revisión de calidad
  url?: string
  tamanyoMin?: number
  tamanyoMax?: number
  fechaEntrega?: string
}

/**
 * Fila detectada en un Excel/CSV de SEO
 */
export interface FilaExcelSeo {
  titulo: string
  keyword: string
  url: string
  estructuraH: string
  yaExiste: boolean
  // Campos opcionales del paso de revisión de calidad
  tamanyoMin?: number
  tamanyoMax?: number
  fechaEntrega?: string
}

/**
 * Pedido — orden de trabajo para ingesta de contenidos
 */
export interface Pedido {
  id: string
  tipo: TipoPedido
  cliente_id: string | null
  proyecto_id: string | null
  nombre_archivo: string | null
  estado: EstadoPedido
  contenidos_generados: number
  errores: unknown[]
  created_at: string

  // Relaciones (opcional, para joins)
  cliente?: Pick<Cliente, 'id' | 'nombre'>
  proyecto?: Pick<Proyecto, 'id' | 'nombre'>
}

// ─────────────────────────────────────────────────────────────
// Formularios
// ─────────────────────────────────────────────────────────────

export interface ClienteFormData {
  nombre: string
  sector: string
  url_web: string
  descripcion: string
  identidad_corporativa: string
}

export interface ProyectoFormData {
  nombre: string
  descripcion: string
  tono_voz: string
  modo_entrega: Proyecto['modo_entrega']
}
