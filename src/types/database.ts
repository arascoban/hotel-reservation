// ─── Enum Types ───────────────────────────────────────────────────────────────

export type ReservationSource =
  | 'booking_com' | 'expedia' | 'airbnb'
  | 'walk_in' | 'phone' | 'website' | 'other'

export type RoomCleaningStatus = 'clean' | 'dirty' | 'maintenance'

export type PaymentMethod = 'cash' | 'ec_card' | 'credit_card' | 'online' | 'unpaid' | 'card_verified'
export type PaymentStatus = 'paid' | 'deposit_paid' | 'unpaid' | 'refunded'
export type ReservationStatus = 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show'
export type RoomTypeCategory = 'single' | 'double' | 'double_sofa' | 'family_double' | 'family_single' | 'family_connecting'
export type SyncFeedType = 'import' | 'export'
export type SyncLogStatus = 'success' | 'error' | 'partial'

// ─── Table Row Types ─────────────────────────────────────────────────────────

export interface RoomType {
  id: string
  category: RoomTypeCategory
  name: string
  base_capacity: number
  max_capacity: number
  sort_order: number
  description: string | null
  created_at: string
  updated_at: string
}

export interface Room {
  id: string
  room_type_id: string
  room_number: string
  name: string
  floor: number | null
  is_active: boolean
  sort_order: number
  notes: string | null
  cleaning_status: RoomCleaningStatus
  cleaning_note: string | null
  cleaning_updated_at: string
  locker_pin: string
  created_at: string
  updated_at: string
}

export interface Locker {
  id: string
  locker_number: string
  pin_code: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface RoomWithType extends Room {
  room_types: RoomType
}

export interface Guest {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  name: string
  email: string | null
  phone: string | null
  street: string | null
  postcode: string | null
  city: string | null
  country: string | null
  notes: string | null
  source: string
  created_at: string
  updated_at: string
}

export interface Reservation {
  id: string
  room_id: string
  guest_id: string | null
  guest_name: string
  guest_email: string | null
  guest_phone: string | null
  guest_count: number
  checkin_at: string
  checkout_at: string
  breakfast_included: boolean
  source: ReservationSource
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  status: ReservationStatus
  total_price: number | null
  notes: string | null
  internal_notes: string | null
  external_id: string | null
  billing_address: string | null
  guest_street:    string | null
  guest_postcode:  string | null
  guest_city:      string | null
  guest_country:   string | null
  family_booking_id: string | null
  locker_id: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface ReservationWithRoom extends Reservation {
  rooms: Room & { room_types: RoomType }
}

export interface SyncFeed {
  id: string
  room_id: string
  platform: ReservationSource
  feed_type: SyncFeedType
  url: string | null
  is_active: boolean
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

// ─── RPC Return Types ─────────────────────────────────────────────────────────

export interface AvailableRoom {
  id: string
  room_number: string
  name: string
  floor: number | null
  room_type_id: string
  type_name: string
  category: RoomTypeCategory
  base_capacity: number
  max_capacity: number
  sort_order: number
}

export interface CalendarReservation {
  id: string
  room_id: string
  room_number: string
  room_name: string
  room_type_id: string
  type_name: string
  category: RoomTypeCategory
  type_sort_order: number
  room_sort_order: number
  guest_name: string
  guest_count: number
  checkin_at: string
  checkout_at: string
  status: ReservationStatus
  source: ReservationSource
  payment_status: PaymentStatus
  breakfast_included: boolean
  total_price: number | null
  family_booking_id: string | null
  deleted_at: string | null
}

// ─── Supabase Database Type Map ───────────────────────────────────────────────

export type Database = {
  public: {
    Views: Record<string, never>
    Tables: {
      room_types: {
        Row: RoomType
        Insert: Omit<RoomType, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<RoomType, 'id' | 'created_at' | 'updated_at'>>
      }
      rooms: {
        Row: Room
        Insert: Omit<Room, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Room, 'id' | 'created_at' | 'updated_at'>>
      }
      guests: {
        Row: Guest
        Insert: Omit<Guest, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Guest, 'id' | 'created_at' | 'updated_at'>>
      }
      customers: {
        Row: Customer
        Insert: Omit<Customer, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Customer, 'id' | 'created_at' | 'updated_at'>>
      }
      reservations: {
        Row: Reservation
        Insert: Omit<Reservation, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Reservation, 'id' | 'created_at' | 'updated_at'>>
      }
      sync_feeds: {
        Row: SyncFeed
        Insert: Omit<SyncFeed, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<SyncFeed, 'id' | 'created_at' | 'updated_at'>>
      }
    }
    Functions: {
      check_room_availability: {
        Args: {
          p_room_id: string
          p_checkin_at: string
          p_checkout_at: string
          p_exclude_id?: string
        }
        Returns: boolean
      }
      create_reservation: {
        Args: {
          p_guest_name: string
          p_guest_email?: string | null
          p_guest_phone?: string | null
          p_room_id: string
          p_checkin_at: string
          p_checkout_at: string
          p_guest_count?: number
          p_breakfast?: boolean
          p_source?: ReservationSource
          p_payment_method?: PaymentMethod
          p_payment_status?: PaymentStatus
          p_status?: ReservationStatus
          p_total_price?: number | null
          p_notes?: string | null
          p_external_id?: string | null
        }
        Returns: string
      }
      update_reservation: {
        Args: {
          p_reservation_id: string
          p_guest_name?: string | null
          p_guest_email?: string | null
          p_guest_phone?: string | null
          p_room_id?: string | null
          p_checkin_at?: string | null
          p_checkout_at?: string | null
          p_guest_count?: number | null
          p_breakfast?: boolean | null
          p_source?: ReservationSource | null
          p_payment_method?: PaymentMethod | null
          p_payment_status?: PaymentStatus | null
          p_status?: ReservationStatus | null
          p_total_price?: number | null
          p_notes?: string | null
          p_external_id?: string | null
        }
        Returns: void
      }
      get_available_rooms: {
        Args: {
          p_checkin_at: string
          p_checkout_at: string
          p_guest_count?: number
          p_exclude_id?: string | null
        }
        Returns: AvailableRoom[]
      }
      get_calendar_reservations: {
        Args: { p_from: string; p_to: string }
        Returns: CalendarReservation[]
      }
    }
    Enums: {
      reservation_source: ReservationSource
      payment_method_type: PaymentMethod
      payment_status_type: PaymentStatus
      reservation_status_type: ReservationStatus
      room_type_category: RoomTypeCategory
    }
  }
}
