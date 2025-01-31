;; Bridgarr Escrow Contract
;; Manages escrow agreements between vendors and buyers

;; Error codes
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-ALREADY-EXISTS (err u101))
(define-constant ERR-INVALID-STATUS (err u102))
(define-constant ERR-INSUFFICIENT-FUNDS (err u103))
(define-constant ERR-NOT-FOUND (err u104))

;; Agreement status constants
(define-constant STATUS-PENDING u1)
(define-constant STATUS-FUNDED u2)
(define-constant STATUS-ACCEPTED u3)
(define-constant STATUS-COMPLETED u4)
(define-constant STATUS-DISPUTED u5)
(define-constant STATUS-REFUNDED u6)

;; Data maps
(define-map agreements
    { agreement-id: uint }
    {
        vendor: principal,
        buyer: principal,
        amount: uint,
        status: uint,
        description: (string-utf8 256),
        created-at: uint
    }
)

(define-map agreement-funds
    { agreement-id: uint }
    { balance: uint }
)

;; Data variables
(define-data-var agreement-nonce uint u0)

;; Read-only functions
(define-read-only (get-agreement (agreement-id uint))
    (map-get? agreements { agreement-id: agreement-id })
)

(define-read-only (get-agreement-funds (agreement-id uint))
    (map-get? agreement-funds { agreement-id: agreement-id })
)

;; Create new agreement
(define-public (create-agreement (buyer principal) (amount uint) (description (string-utf8 256)))
    (let
        (
            (agreement-id (+ (var-get agreement-nonce) u1))
        )
        ;; Only allow new agreements
        (asserts! (is-none (get-agreement agreement-id)) ERR-ALREADY-EXISTS)
        
        ;; Store agreement details
        (map-set agreements
            { agreement-id: agreement-id }
            {
                vendor: tx-sender,
                buyer: buyer,
                amount: amount,
                status: STATUS-PENDING,
                description: description,
                created-at: block-height
            }
        )
        
        ;; Increment nonce
        (var-set agreement-nonce agreement-id)
        
        (ok agreement-id)
    )
)

;; Fund agreement
(define-public (fund-agreement (agreement-id uint))
    (let
        (
            (agreement (unwrap! (get-agreement agreement-id) ERR-NOT-FOUND))
        )
        ;; Verify sender is buyer
        (asserts! (is-eq tx-sender (get buyer agreement)) ERR-NOT-AUTHORIZED)
        ;; Verify status is pending
        (asserts! (is-eq (get status agreement) STATUS-PENDING) ERR-INVALID-STATUS)
        
        ;; Transfer funds to contract
        (try! (stx-transfer? (get amount agreement) tx-sender (as-contract tx-sender)))
        
        ;; Update agreement status
        (map-set agreements
            { agreement-id: agreement-id }
            (merge agreement { status: STATUS-FUNDED })
        )
        
        ;; Store funds info
        (map-set agreement-funds
            { agreement-id: agreement-id }
            { balance: (get amount agreement) }
        )
        
        (ok true)
    )
)

;; Accept agreement
(define-public (accept-agreement (agreement-id uint))
    (let
        (
            (agreement (unwrap! (get-agreement agreement-id) ERR-NOT-FOUND))
        )
        ;; Verify sender is buyer
        (asserts! (is-eq tx-sender (get buyer agreement)) ERR-NOT-AUTHORIZED)
        ;; Verify status is funded
        (asserts! (is-eq (get status agreement) STATUS-FUNDED) ERR-INVALID-STATUS)
        
        ;; Update agreement status
        (map-set agreements
            { agreement-id: agreement-id }
            (merge agreement { status: STATUS-ACCEPTED })
        )
        
        (ok true)
    )
)

;; Complete agreement and release funds
(define-public (complete-agreement (agreement-id uint))
    (let
        (
            (agreement (unwrap! (get-agreement agreement-id) ERR-NOT-FOUND))
            (funds (unwrap! (get-agreement-funds agreement-id) ERR-NOT-FOUND))
        )
        ;; Verify sender is buyer
        (asserts! (is-eq tx-sender (get buyer agreement)) ERR-NOT-AUTHORIZED)
        ;; Verify status is accepted
        (asserts! (is-eq (get status agreement) STATUS-ACCEPTED) ERR-INVALID-STATUS)
        
        ;; Transfer funds to vendor
        (try! (as-contract (stx-transfer? (get balance funds) tx-sender (get vendor agreement))))
        
        ;; Update agreement status
        (map-set agreements
            { agreement-id: agreement-id }
            (merge agreement { status: STATUS-COMPLETED })
        )
        
        ;; Clear funds
        (map-delete agreement-funds { agreement-id: agreement-id })
        
        (ok true)
    )
)

;; Dispute agreement
(define-public (dispute-agreement (agreement-id uint))
    (let
        (
            (agreement (unwrap! (get-agreement agreement-id) ERR-NOT-FOUND))
        )
        ;; Verify sender is buyer
        (asserts! (is-eq tx-sender (get buyer agreement)) ERR-NOT-AUTHORIZED)
        ;; Verify status is accepted
        (asserts! (is-eq (get status agreement) STATUS-ACCEPTED) ERR-INVALID-STATUS)
        
        ;; Update agreement status
        (map-set agreements
            { agreement-id: agreement-id }
            (merge agreement { status: STATUS-DISPUTED })
        )
        
        (ok true)
    )
)

;; Refund agreement (only callable by contract owner in case of disputes)
(define-public (refund-agreement (agreement-id uint))
    (let
        (
            (agreement (unwrap! (get-agreement agreement-id) ERR-NOT-FOUND))
            (funds (unwrap! (get-agreement-funds agreement-id) ERR-NOT-FOUND))
        )
        ;; Verify sender is contract owner
        (asserts! (is-eq tx-sender (contract-owner)) ERR-NOT-AUTHORIZED)
        ;; Verify status is disputed
        (asserts! (is-eq (get status agreement) STATUS-DISPUTED) ERR-INVALID-STATUS)
        
        ;; Transfer funds back to buyer
        (try! (as-contract (stx-transfer? (get balance funds) tx-sender (get buyer agreement))))
        
        ;; Update agreement status
        (map-set agreements
            { agreement-id: agreement-id }
            (merge agreement { status: STATUS-REFUNDED })
        )
        
        ;; Clear funds
        (map-delete agreement-funds { agreement-id: agreement-id })
        
        (ok true)
    )
)